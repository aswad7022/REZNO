import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type {
  PlatformJobType,
  StoragePurpose,
  StorageVisibility,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import sharp from "sharp";

import { attachMedia, detachMedia } from "../../../features/media/services/media-lifecycle";
import { createPublicMediaDownloadTarget } from "../../../features/media/services/delivery";
import { executePlatformJobHandler } from "../../../features/platform-jobs/services/handlers";
import { platformJobHash } from "../../../features/platform-jobs/domain/canonical";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import {
  claimPlatformJobsInTransaction,
  completePlatformJob,
  enqueueDomainDiscoveryPlatformJob,
  enqueuePlatformJob,
  failPlatformJob,
  startPlatformJob,
  type ClaimedPlatformJob,
} from "../../../features/platform-jobs/services/jobs";
import type { PlatformJobAdminContext } from "../../../features/platform-jobs/services/admin-context";
import type { PlatformJobOperationAuthority } from "../../../features/platform-jobs/services/operation-lease";
import { runPlatformJobSerializable } from "../../../features/platform-jobs/services/transaction";
import {
  generateMediaRenditionObjectKey,
  mediaRenditionSourceFingerprint,
} from "../../../features/media/domain/rendition-registry";
import {
  STORAGE_INSPECTION_POLICY_VERSION,
  STORAGE_ORPHAN_RETENTION_MS,
  generateStorageObjectKey,
  sha256Hex,
} from "../../../features/storage/domain/policy";
import { DeterministicStorageProvider } from "../../../features/storage/providers/deterministic";
import type { StorageProvider } from "../../../features/storage/providers/provider";
import { setStorageProviderForTests } from "../../../features/storage/providers/registry";
import type { StorageActor } from "../../../features/storage/services/actor";
import { setStorageMalwareScannerForTests } from "../../../features/storage/services/storage-mutations";
import {
  requestStoredAssetRescan,
  storageAutomationStatus,
  triggerStorageAutomationDiscovery,
} from "../../../features/storage-automation/services/admin";
import { setStorageAutomationErrorTestHook } from "../../../features/storage-automation/services/handlers";
import { prisma } from "../../../lib/db/prisma";
import {
  createStorageFixture,
  resetStorageTestDatabase,
} from "../helpers/storage-fixture";

type RunningJob = {
  claim: ClaimedPlatformJob;
  operation: PlatformJobOperationAuthority;
  workerId: string;
};

test("Gate 6B storage and media automation is durable, fenced, and exact", { concurrency: false }, async (t) => {
  await resetStorageTestDatabase();
  t.after(async () => {
    setStorageAutomationErrorTestHook(undefined);
    setStorageMalwareScannerForTests(undefined);
    setStorageProviderForTests(undefined);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("Migrations 45-47 are healthy, schema-only, indexed, and constrained", async () => {
    const [migration] = await prisma.$queryRaw<Array<{
      applied: bigint;
      failed: bigint;
      rolledBack: bigint;
      total: bigint;
    }>>(Prisma.sql`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
             count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed,
             count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::bigint AS "rolledBack"
      FROM "_prisma_migrations"
    `);
    assert.deepEqual(migration, {
      applied: BigInt(47), failed: BigInt(0), rolledBack: BigInt(0), total: BigInt(47),
    });
    assert.equal(await prisma.platformJob.count(), 0);
    assert.equal(await prisma.platformJobSchedule.count(), 0);
    assert.equal(await prisma.mediaRendition.count(), 0);
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conname IN (
        'StoredAsset_rescan_claim_check',
        'PlatformJob_source_check',
        'MediaRendition_claim_check',
        'MediaRendition_failure_check',
        'MediaRendition_output_check',
        'MediaRendition_profile_bounds_check'
      )
      ORDER BY conname
    `);
    assert.deepEqual(constraints.map((row) => row.name), [
      "MediaRendition_claim_check",
      "MediaRendition_failure_check",
      "MediaRendition_output_check",
      "MediaRendition_profile_bounds_check",
      "PlatformJob_source_check",
      "StoredAsset_rescan_claim_check",
    ]);
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'MediaRendition_sourceAssetId_sourceAssetVersion_profile_key',
          'MediaRendition_state_updatedAt_id_idx',
          'StoredAsset_state_inspectionPolicyVersion_updatedAt_id_idx',
          'PlatformJob_parentJobId_createdAt_id_idx'
        )
      ORDER BY indexname
    `);
    assert.equal(indexes.length, 4);
  });

  const fixture = await createStorageFixture("gate6b-automation");
  await prisma.adminAccess.update({
    where: { id: fixture.adminAccess.id },
    data: {
      permissions: [
        "STORAGE_RECORDS_VIEW",
        "STORAGE_RECORDS_MANAGE",
        "PLATFORM_JOBS_VIEW",
        "PLATFORM_JOBS_MANAGE",
      ],
    },
  });
  await prisma.organizationSettings.create({ data: { organizationId: fixture.organization.id } });
  const context: PlatformJobAdminContext = {
    adminAccessId: fixture.adminAccess.id,
    personId: fixture.actors.admin.personId,
    source: "database",
    userId: fixture.actors.admin.userId,
  };
  await prisma.adminAccess.update({
    where: { id: fixture.viewAdminAccess.id },
    data: {
      permissions: [
        "STORAGE_RECORDS_VIEW",
        "STORAGE_RECORDS_MANAGE",
        "PLATFORM_JOBS_VIEW",
        "PLATFORM_JOBS_MANAGE",
      ],
    },
  });
  const secondContext: PlatformJobAdminContext = {
    adminAccessId: fixture.viewAdminAccess.id,
    personId: fixture.actors.viewAdmin.personId,
    source: "database",
    userId: fixture.actors.viewAdmin.userId,
  };
  const provider = new DeterministicStorageProvider();
  setStorageProviderForTests(provider);
  const sourceBytes = await sharp({
    create: { background: "#2457a6", channels: 3, height: 500, width: 1_000 },
  }).png().toBuffer();
  const setExecutionStoragePermission = (enabled: boolean) => prisma.adminAccess.update({
    where: { id: fixture.adminAccess.id },
    data: {
      permissions: enabled
        ? [
            "STORAGE_RECORDS_VIEW",
            "STORAGE_RECORDS_MANAGE",
            "PLATFORM_JOBS_VIEW",
            "PLATFORM_JOBS_MANAGE",
          ]
        : ["STORAGE_RECORDS_VIEW", "PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"],
    },
  });

  await t.test("Migration 47 enforces exact nullable constraint truth tables", async () => {
    await resetAutomationRows();
    const assets = await Promise.all(Array.from({ length: 5 }, () =>
      createAsset(fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY")));
    const [running] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: assets[0]!.id, expectedVersion: assets[0]!.version, profile: "AVATAR_256_WEBP" },
    }]);
    const claim = running.claim;
    const pending = await createPendingRendition(assets[0]!, "AVATAR_256_WEBP", provider);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "state" = 'PROCESSING' WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid
      WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = NULL,
          "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid,
          "claimLeaseToken" = NULL,
          "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid,
          "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = NULL, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid,
          "claimLeaseToken" = ${claim.leaseToken}::uuid, "claimFencingToken" = 0,
          "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid,
          "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = NULL
      WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_claim_check/u);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid,
          "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${pending.id}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PENDING', "claimJobId" = NULL, "claimLeaseToken" = NULL,
          "claimFencingToken" = NULL, "claimExpiresAt" = NULL
      WHERE "id" = ${pending.id}::uuid
    `);

    const ready = await createReadyRendition(assets[1]!, "AVATAR_256_WEBP", provider, sourceBytes);
    const failed = await createPendingRendition(assets[2]!, "AVATAR_256_WEBP", provider);
    await prisma.mediaRendition.update({
      where: { id: failed.id },
      data: { failureCode: "SAFE_FAILURE", state: "FAILED" },
    });
    const superseded = await createReadyRendition(assets[3]!, "AVATAR_256_WEBP", provider, sourceBytes);
    await prisma.mediaRendition.update({ where: { id: superseded.id }, data: { state: "SUPERSEDED" } });
    const deleted = await createPendingRendition(assets[4]!, "AVATAR_256_WEBP", provider);
    const deleteRequestedAt = new Date();
    await prisma.mediaRendition.update({
      where: { id: deleted.id },
      data: { deleteRequestedAt, deletedAt: deleteRequestedAt, state: "DELETED" },
    });
    for (const id of [pending.id, ready.id, failed.id, superseded.id, deleted.id]) {
      await assert.rejects(prisma.$executeRaw(Prisma.sql`
        UPDATE "MediaRendition"
        SET "claimJobId" = ${claim.id}::uuid, "claimLeaseToken" = ${claim.leaseToken}::uuid,
            "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = ${claim.leaseExpiresAt}
        WHERE "id" = ${id}::uuid
      `), /MediaRendition_claim_check/u);
    }

    const idleDelete = await createPendingRendition(assets[0]!, "CARD_640_WEBP", provider);
    await prisma.mediaRendition.update({
      where: { id: idleDelete.id },
      data: { deleteRequestedAt, state: "DELETE_PENDING" },
    });
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "claimJobId" = ${claim.id}::uuid WHERE "id" = ${idleDelete.id}::uuid
    `), /MediaRendition_claim_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "claimJobId" = ${claim.id}::uuid, "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = NULL, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${idleDelete.id}::uuid
    `), /MediaRendition_claim_check/u);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "claimJobId" = ${claim.id}::uuid, "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${idleDelete.id}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "claimJobId" = NULL, "claimLeaseToken" = NULL,
          "claimFencingToken" = NULL, "claimExpiresAt" = NULL
      WHERE "id" = ${idleDelete.id}::uuid
    `);
    assert.equal((await prisma.mediaRendition.findUniqueOrThrow({ where: { id: idleDelete.id } })).state, "DELETE_PENDING");

    for (const missing of ["job", "lease", "fence", "expiry"] as const) {
      await assert.rejects(prisma.$executeRaw(Prisma.sql`
        UPDATE "StoredAsset"
        SET "rescanClaimJobId" = ${missing === "job" ? null : claim.id}::uuid,
            "rescanClaimLeaseToken" = ${missing === "lease" ? null : claim.leaseToken}::uuid,
            "rescanClaimFencingToken" = ${missing === "fence" ? null : claim.fencingToken},
            "rescanClaimExpiresAt" = ${missing === "expiry" ? null : claim.leaseExpiresAt}
        WHERE "id" = ${assets[0]!.id}::uuid
      `), /StoredAsset_rescan_claim_check/u);
    }
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "StoredAsset"
      SET "rescanClaimJobId" = ${claim.id}::uuid,
          "rescanClaimLeaseToken" = ${claim.leaseToken}::uuid,
          "rescanClaimFencingToken" = 0,
          "rescanClaimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${assets[0]!.id}::uuid
    `), /StoredAsset_rescan_claim_check/u);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "StoredAsset"
      SET "rescanClaimJobId" = ${claim.id}::uuid,
          "rescanClaimLeaseToken" = ${claim.leaseToken}::uuid,
          "rescanClaimFencingToken" = ${claim.fencingToken},
          "rescanClaimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${assets[0]!.id}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "StoredAsset"
      SET "rescanClaimJobId" = NULL, "rescanClaimLeaseToken" = NULL,
          "rescanClaimFencingToken" = NULL, "rescanClaimExpiresAt" = NULL
      WHERE "id" = ${assets[0]!.id}::uuid
    `);

    const requiredOutputFields = [
      "mimeType",
      "sizeBytes",
      "checksumSha256",
      "width",
      "height",
      "readyAt",
    ] as const;
    for (const rendition of [ready, superseded]) {
      for (const field of requiredOutputFields) {
        await assertMediaRenditionNullRejected(rendition.id, field, /MediaRendition_(output|profile_bounds)_check/u);
      }
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "providerObjectVersion" = NULL WHERE "id" = ${ready.id}::uuid
    `);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "width" = 257 WHERE "id" = ${ready.id}::uuid
    `), /MediaRendition_profile_bounds_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "width" = 0 WHERE "id" = ${ready.id}::uuid
    `), /MediaRendition_(output|profile_bounds)_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "providerObjectVersion" = 'partial' WHERE "id" = ${idleDelete.id}::uuid
    `), /MediaRendition_output_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "mimeType" = 'image/webp' WHERE "id" = ${deleted.id}::uuid
    `), /MediaRendition_output_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "mimeType" = 'image/webp' WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_output_check/u);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "mimeType" = 'image/webp' WHERE "id" = ${failed.id}::uuid
    `), /MediaRendition_output_check/u);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'DELETE_PENDING', "deleteRequestedAt" = ${deleteRequestedAt}
      WHERE "id" = ${ready.id}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'READY', "deleteRequestedAt" = NULL
      WHERE "id" = ${ready.id}::uuid
    `);
    assert.equal((await prisma.mediaRendition.findUniqueOrThrow({ where: { id: idleDelete.id } })).state, "DELETE_PENDING");

    for (const id of [pending.id, ready.id, failed.id, superseded.id]) {
      await assert.rejects(prisma.$executeRaw(Prisma.sql`
        UPDATE "MediaRendition" SET "deleteRequestedAt" = ${deleteRequestedAt} WHERE "id" = ${id}::uuid
      `), /MediaRendition_delete_check/u);
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PROCESSING', "claimJobId" = ${claim.id}::uuid,
          "claimLeaseToken" = ${claim.leaseToken}::uuid,
          "claimFencingToken" = ${claim.fencingToken}, "claimExpiresAt" = ${claim.leaseExpiresAt}
      WHERE "id" = ${pending.id}::uuid
    `);
    await assert.rejects(prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition" SET "deleteRequestedAt" = ${deleteRequestedAt} WHERE "id" = ${pending.id}::uuid
    `), /MediaRendition_delete_check/u);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = 'PENDING', "claimJobId" = NULL, "claimLeaseToken" = NULL,
          "claimFencingToken" = NULL, "claimExpiresAt" = NULL
      WHERE "id" = ${pending.id}::uuid
    `);
  });

  await t.test("Admin status and discovery are permission-revalidated and idempotent without auto-activation", async () => {
    await resetAutomationRows();
    const status = await storageAutomationStatus(context, fixture.actors.admin);
    assert.equal(status.provider, "DETERMINISTIC_TEST");
    assert.equal(status.runtime.automaticScheduler, "NOT_CONNECTED");
    assert.equal(status.runtime.alwaysOnWorker, "NOT_CONNECTED");
    assert.equal(status.jobTypes.length, 9);
    assert.equal(status.scheduleKeys.length, 4);
    assert.equal(status.renditionProfiles.length, 3);
    const idempotencyKey = randomUUID();
    const first = await triggerStorageAutomationDiscovery(context, fixture.actors.admin, {
      batchSize: 10,
      idempotencyKey,
      jobType: "STORAGE_MAINTENANCE_DISCOVERY",
    });
    assert.deepEqual(await triggerStorageAutomationDiscovery(context, fixture.actors.admin, {
      batchSize: 10,
      idempotencyKey,
      jobType: "STORAGE_MAINTENANCE_DISCOVERY",
    }), { ...first, replay: true });
    assert.equal(await prisma.platformJob.count(), 1);
    assert.equal(await prisma.platformJobSchedule.count(), 0);
    await prisma.adminAccess.update({
      where: { id: fixture.adminAccess.id },
      data: { permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"] },
    });
    await assert.rejects(storageAutomationStatus(context, fixture.actors.admin));
    await prisma.adminAccess.update({
      where: { id: fixture.adminAccess.id },
      data: {
        permissions: [
          "STORAGE_RECORDS_VIEW",
          "STORAGE_RECORDS_MANAGE",
          "PLATFORM_JOBS_VIEW",
          "PLATFORM_JOBS_MANAGE",
        ],
      },
    });
  });

  await t.test("concurrent maintenance discovery is bounded, ordered, and deduplicates exact orphan children", async () => {
    await resetAutomationRows();
    const older = await createExpiredOrphan(fixture.actors.customer, provider, sourceBytes, -2_000);
    const newer = await createExpiredOrphan(fixture.actors.customer, provider, sourceBytes, -1_000);
    const jobs = await prepareRunningJobs(context, [
      { jobType: "STORAGE_MAINTENANCE_DISCOVERY", payload: { batchSize: 10 } },
      { jobType: "STORAGE_MAINTENANCE_DISCOVERY", payload: { batchSize: 10 } },
    ]);
    const outcomes = await Promise.all(jobs.map(runHandler));
    assert.equal(outcomes.every((outcome) => outcome.outcome === "SUCCEEDED"), true);
    const children = await prisma.platformJob.findMany({
      where: { jobType: "STORAGE_ORPHAN_CLEANUP" }, orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    });
    assert.deepEqual(children.map((job) => (job.payload as { uploadSessionId: string }).uploadSessionId), [older.id, newer.id]);
    assert.equal(new Set(children.map((job) => job.deduplicationKey)).size, 2);
    assert.equal(children.every((job) => job.source === "DOMAIN_DISCOVERY" && Boolean(job.parentJobId)), true);
  });

  await t.test("canonical domain children dedupe atomically across Admin actors and retain first provenance", async () => {
    await resetAutomationRows();
    const availableAt = new Date("2026-07-22T12:00:00.123Z");
    const [firstParent, secondParent] = await Promise.all([
      createDiscoveryParent(context, "first-parent"),
      createDiscoveryParent(secondContext, "second-parent"),
    ]);
    const cases: Array<{
      jobType: Exclude<PlatformJobType, "PLATFORM_HEALTH_PROBE">;
      key: string;
      payload: Record<string, unknown>;
    }> = [
      {
        jobType: "STORAGE_ORPHAN_CLEANUP",
        key: `gate6b:orphan:${randomUUID()}:v1`,
        payload: { expectedVersion: 1, uploadSessionId: randomUUID() },
      },
      {
        jobType: "STORAGE_ASSET_DELETE_RETRY",
        key: `gate6b:asset-delete:${randomUUID()}:v1`,
        payload: { assetId: randomUUID(), expectedVersion: 1 },
      },
      {
        jobType: "STORAGE_ASSET_RESCAN",
        key: `gate6b:rescan:${randomUUID()}:v1`,
        payload: { assetId: randomUUID(), expectedVersion: 1 },
      },
      {
        jobType: "MEDIA_RENDITION_GENERATE",
        key: `gate6b:rendition:${randomUUID()}:v1:CARD_640_WEBP`,
        payload: { assetId: randomUUID(), expectedVersion: 1, profile: "CARD_640_WEBP" },
      },
    ];
    for (const item of cases) {
      const create = (
        actor: PlatformJobAdminContext,
        parentJobId: string,
      ) => runPlatformJobSerializable((transaction) => enqueueDomainDiscoveryPlatformJob(transaction, {
        availableAt,
        createdByAdminUserId: actor.userId,
        createdByPersonId: actor.personId,
        deduplicationKey: item.key,
        jobType: item.jobType,
        parentJobId,
        payload: item.payload,
        payloadVersion: 1,
      }));
      const [left, right] = await Promise.all([
        create(context, firstParent.id),
        create(secondContext, secondParent.id),
      ]);
      assert.equal(Number(left.replay) + Number(right.replay), 1);
      assert.equal(left.job.id, right.job.id);
      const winner = left.replay
        ? { actor: secondContext, parentJobId: secondParent.id }
        : { actor: context, parentJobId: firstParent.id };
      const stored = await prisma.platformJob.findUniqueOrThrow({ where: { id: left.job.id } });
      assert.equal(stored.createdByAdminUserId, winner.actor.userId);
      assert.equal(stored.createdByPersonId, winner.actor.personId);
      assert.equal(stored.parentJobId, winner.parentJobId);
      assert.equal(stored.payloadHash, platformJobHash(item.payload));
      assert.equal(await prisma.platformJob.count({ where: { deduplicationKey: item.key } }), 1);
    }

    const original = cases[0]!;
    const exactReplay = await runPlatformJobSerializable((transaction) => enqueueDomainDiscoveryPlatformJob(transaction, {
      availableAt,
      createdByAdminUserId: secondContext.userId,
      createdByPersonId: secondContext.personId,
      deduplicationKey: original.key,
      jobType: original.jobType,
      parentJobId: secondParent.id,
      payload: original.payload,
      payloadVersion: 1,
    }));
    assert.equal(exactReplay.replay, true);
    for (const changed of [
      { jobType: original.jobType, payload: { ...original.payload, expectedVersion: 2 } },
      { jobType: "STORAGE_ASSET_DELETE_RETRY" as const, payload: { assetId: randomUUID(), expectedVersion: 1 } },
    ]) {
      await assert.rejects(runPlatformJobSerializable((transaction) => enqueueDomainDiscoveryPlatformJob(transaction, {
        availableAt,
        createdByAdminUserId: secondContext.userId,
        createdByPersonId: secondContext.personId,
        deduplicationKey: original.key,
        jobType: changed.jobType,
        parentJobId: secondParent.id,
        payload: changed.payload,
        payloadVersion: 1,
      })), platformCode("IDEMPOTENCY_CONFLICT"));
    }

    const manualKey = `gate6b:manual-actor-bound:${randomUUID()}`;
    const manualPayload = { assetId: randomUUID(), expectedVersion: 1 };
    await runPlatformJobSerializable((transaction) => enqueuePlatformJob(transaction, {
      availableAt,
      createdByAdminUserId: context.userId,
      createdByPersonId: context.personId,
      deduplicationKey: manualKey,
      jobType: "STORAGE_ASSET_RESCAN",
      payload: manualPayload,
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    }));
    await assert.rejects(runPlatformJobSerializable((transaction) => enqueuePlatformJob(transaction, {
      availableAt,
      createdByAdminUserId: secondContext.userId,
      createdByPersonId: secondContext.personId,
      deduplicationKey: manualKey,
      jobType: "STORAGE_ASSET_RESCAN",
      payload: manualPayload,
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    })), platformCode("IDEMPOTENCY_CONFLICT"));
  });

  await t.test("domain idempotency conflicts are permanent and never become HANDLER_EXCEPTION retries", async () => {
    await resetAutomationRows();
    const orphan = await createExpiredOrphan(fixture.actors.customer, provider, sourceBytes, -1_000);
    const [discovery] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_MAINTENANCE_DISCOVERY",
      payload: { batchSize: 10 },
    }]);
    const rawErrors: unknown[] = [];
    setStorageAutomationErrorTestHook((error) => rawErrors.push(error));
    await runPlatformJobSerializable((transaction) => enqueueDomainDiscoveryPlatformJob(transaction, {
      availableAt: new Date(orphan.expiresAt.getTime() + STORAGE_ORPHAN_RETENTION_MS),
      createdByAdminUserId: context.userId,
      createdByPersonId: context.personId,
      deduplicationKey: `gate6b:orphan:${orphan.id}:v${orphan.version}`,
      jobType: "STORAGE_ORPHAN_CLEANUP",
      parentJobId: discovery.claim.id,
      payload: { expectedVersion: orphan.version + 1, uploadSessionId: orphan.id },
      payloadVersion: 1,
    }));
    const outcome = await runHandler(discovery);
    assert.deepEqual(outcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
    assert.equal(rawErrors.length, 1);
    assert.equal(rawErrors[0] instanceof PlatformJobDomainError, true);
    await settleHandler(discovery, outcome);
    const stored = await prisma.platformJob.findUniqueOrThrow({ where: { id: discovery.claim.id } });
    assert.equal(stored.status, "FAILED");
    assert.equal(stored.lastErrorCode, "PERMANENT_FAILURE");
    assert.equal(stored.attemptCount, 1);
    assert.equal(await prisma.platformJobAttempt.count({
      where: { errorCode: "HANDLER_EXCEPTION", jobId: discovery.claim.id },
    }), 0);
    setStorageAutomationErrorTestHook(undefined);
  });

  await t.test("an exact orphan claim has one provider winner and NOT_FOUND is terminal success", async () => {
    await resetAutomationRows();
    const orphan = await createExpiredOrphan(fixture.actors.customer, provider, sourceBytes, -1_000);
    let deleteCalls = 0;
    setStorageProviderForTests(wrapProvider(provider, {
      deleteObject: async (input) => {
        deleteCalls += 1;
        return provider.deleteObject(input);
      },
    }));
    const [running] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_ORPHAN_CLEANUP",
      payload: { expectedVersion: orphan.version, uploadSessionId: orphan.id },
    }]);
    const outcomes = await Promise.all([runHandler(running), runHandler(running)]);
    assert.equal(outcomes.some((outcome) => outcome.outcome === "SUCCEEDED"), true);
    assert.equal(deleteCalls, 1);
    const cleaned = await prisma.uploadSession.findUniqueOrThrow({ where: { id: orphan.id } });
    assert.equal(cleaned.failureCode, "ORPHAN_OBJECT_DELETED");
    assert.equal(cleaned.version, orphan.version + 1);

    setStorageProviderForTests(provider);
    const absent = await createExpiredOrphan(fixture.actors.customer, provider, sourceBytes, 0, false);
    const [absentJob] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_ORPHAN_CLEANUP",
      payload: { expectedVersion: absent.version, uploadSessionId: absent.id },
    }]);
    const absentOutcome = await runHandler(absentJob);
    assert.equal(absentOutcome.outcome, "SUCCEEDED");
    if (absentOutcome.outcome === "SUCCEEDED") {
      assert.deepEqual(absentOutcome.metadata, {
        kind: "STORAGE_ORPHAN_CLEANED", outcome: "ABSENT", state: "EXPIRED",
      });
    }
  });

  await t.test("DELETE_PENDING retains quota through transient failure and releases only after confirmed deletion", async () => {
    await resetAutomationRows();
    setStorageProviderForTests(provider);
    const asset = await createAsset(fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "DELETE_PENDING");
    provider.setDeleteOutcomes(asset.objectKey, ["TRANSIENT_FAILURE", "READY"]);
    let [running] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_ASSET_DELETE_RETRY",
      payload: { assetId: asset.id, expectedVersion: asset.version },
    }]);
    const first = await runHandler(running);
    assert.deepEqual(first, { errorCode: "TRANSIENT_FAILURE", outcome: "FAILED", retryable: true });
    await settleHandler(running, first);
    let stored = await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(stored.state, "DELETE_PENDING");
    assert.equal(provider.hasObject(asset.objectKey), true);
    assert.equal(stored.providerCleanupClaimId, null);
    await prisma.platformJob.update({ where: { id: running.claim.id }, data: { availableAt: new Date(Date.now() - 1_000) } });
    [running] = await claimAndStart(1, context);
    const second = await runHandler(running);
    assert.equal(second.outcome, "SUCCEEDED");
    await settleHandler(running, second);
    stored = await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(stored.state, "DELETED");
    assert.equal(provider.hasObject(asset.objectKey), false);
    assert.equal(stored.version, asset.version + 1);
  });

  await t.test("an ACTIVE binding blocks provider deletion even for an exact DELETE_PENDING job", async () => {
    await resetAutomationRows();
    const asset = await createAsset(
      fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY",
    );
    await attachMedia(fixture.actors.customer, {
      assetId: asset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    const deletePending = await prisma.storedAsset.update({
      where: { id: asset.id },
      data: { deleteRequestedAt: new Date(), state: "DELETE_PENDING", version: { increment: 1 } },
    });
    let deleteCalls = 0;
    setStorageProviderForTests(wrapProvider(provider, {
      deleteObject: async (input) => {
        deleteCalls += 1;
        return provider.deleteObject(input);
      },
    }));
    const [running] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_ASSET_DELETE_RETRY",
      payload: { assetId: asset.id, expectedVersion: deletePending.version },
    }]);
    const outcome = await runHandler(running);
    assert.deepEqual(outcome, {
      metadata: { kind: "STORAGE_ASSET_DELETE_RETRIED", outcome: "STALE", state: "ACTIVE_BINDING" },
      outcome: "SUCCEEDED",
    });
    assert.equal(deleteCalls, 0);
    assert.equal((await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })).state, "DELETE_PENDING");
    assert.equal(provider.hasObject(asset.objectKey), true);
    setStorageProviderForTests(provider);
  });

  await t.test("rescan claims have one winner and malware rejection atomically detaches bindings and supersedes renditions", async () => {
    await resetAutomationRows();
    const rawErrors: string[] = [];
    setStorageAutomationErrorTestHook((error) => rawErrors.push(String(error)));
    setStorageProviderForTests(provider);
    const asset = await createAsset(fixture.actors.owner, "BUSINESS_LOGO", sourceBytes, provider, "READY");
    const attached = await attachMedia(fixture.actors.owner, {
      assetId: asset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const binding = attached.bindings.find((item) => item.media?.assetId === asset.id)!;
    const rendition = await createReadyRendition(asset, "CARD_640_WEBP", provider, sourceBytes);
    setStorageMalwareScannerForTests({ inspect: async () => "MALWARE_DETECTED" });
    const requested = await requestStoredAssetRescan(context, fixture.actors.admin, {
      assetId: asset.id,
      expectedVersion: asset.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(requested.replay, false);
    const [running] = await claimAndStart(1, context);
    const outcomes = await Promise.all([runHandler(running), runHandler(running)]);
    assert.equal(
      outcomes.filter((outcome) => outcome.outcome === "SUCCEEDED").length >= 1,
      true,
      JSON.stringify({ outcomes, rawErrors }),
    );
    const [stored, storedBinding, storedRendition, container] = await Promise.all([
      prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } }),
      prisma.mediaBinding.findUniqueOrThrow({ where: { id: binding.id } }),
      prisma.mediaRendition.findUniqueOrThrow({ where: { id: rendition.id } }),
      prisma.mediaContainer.findUniqueOrThrow({ where: { id: attached.id! } }),
    ]);
    assert.equal(stored.state, "REJECTED");
    assert.equal(stored.version, asset.version + 1);
    assert.equal(stored.rescanClaimJobId, null);
    assert.equal(storedBinding.state, "DETACHED");
    assert.equal(storedRendition.state, "SUPERSEDED");
    assert.equal(container.version, attached.version + 1);
    setStorageMalwareScannerForTests(undefined);
    setStorageAutomationErrorTestHook(undefined);
  });

  await t.test("a source-version race cannot apply a stale rescan result", async () => {
    await resetAutomationRows();
    const asset = await createAsset(fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY");
    const gate = deferred<void>();
    const entered = deferred<void>();
    setStorageProviderForTests(wrapProvider(provider, {
      getObjectForInspection: async (input) => {
        entered.resolve();
        await gate.promise;
        return provider.getObjectForInspection(input);
      },
    }));
    const [running] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_ASSET_RESCAN",
      payload: { assetId: asset.id, expectedVersion: asset.version },
    }]);
    const pending = runHandler(running);
    await entered.promise;
    await prisma.storedAsset.update({ where: { id: asset.id }, data: { version: { increment: 1 } } });
    gate.resolve();
    const outcome = await pending;
    assert.deepEqual(outcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
    const stored = await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(stored.version, asset.version + 1);
    assert.equal(stored.lastRescannedAt, null);
    assert.equal(stored.state, "READY");
    setStorageProviderForTests(provider);
  });

  await t.test("revocation during provider HEAD or read prevents rescan outcome and binding detach", async () => {
    for (const phase of ["HEAD", "READ"] as const) {
      await resetAutomationRows();
      await setExecutionStoragePermission(true);
      setStorageProviderForTests(provider);
      const asset = await createAsset(fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY");
      const container = await attachMedia(fixture.actors.customer, {
        assetId: asset.id,
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
        slot: "CUSTOMER_AVATAR",
        target: { kind: "CUSTOMER_PROFILE" },
      });
      const binding = container.bindings.find((item) => item.media?.assetId === asset.id)!;
      setStorageMalwareScannerForTests({ inspect: async () => "MALWARE_DETECTED" });
      let revoked = false;
      setStorageProviderForTests(wrapProvider(provider, {
        getObjectForInspection: async (input) => {
          const result = await provider.getObjectForInspection(input);
          if (phase === "READ" && !revoked) {
            revoked = true;
            await setExecutionStoragePermission(false);
          }
          return result;
        },
        headObject: async (input) => {
          const result = await provider.headObject(input);
          if (phase === "HEAD" && !revoked) {
            revoked = true;
            await setExecutionStoragePermission(false);
          }
          return result;
        },
      }));
      const [running] = await prepareRunningJobs(context, [{
        jobType: "STORAGE_ASSET_RESCAN",
        payload: { assetId: asset.id, expectedVersion: asset.version },
      }]);
      const outcome = await runHandler(running);
      assert.deepEqual(outcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
      const [stored, storedBinding] = await Promise.all([
        prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } }),
        prisma.mediaBinding.findUniqueOrThrow({ where: { id: binding.id } }),
      ]);
      assert.equal(stored.state, "READY");
      assert.equal(stored.lastRescannedAt, null);
      assert.equal(stored.rescanClaimJobId, running.claim.id);
      assert.equal(stored.rescanClaimLeaseToken, running.claim.leaseToken);
      assert.equal(storedBinding.state, "ACTIVE");
      await setExecutionStoragePermission(true);
      setStorageMalwareScannerForTests(undefined);
      setStorageProviderForTests(provider);
    }
  });

  await t.test("revocation during rendition write prevents publication and leaves a complete expiring claim", async () => {
    await resetAutomationRows();
    await setExecutionStoragePermission(true);
    setStorageProviderForTests(provider);
    const asset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: asset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    let revoked = false;
    setStorageProviderForTests(wrapProvider(provider, {
      writeObject: async (input) => {
        const result = await provider.writeObject(input);
        if (!revoked) {
          revoked = true;
          await setExecutionStoragePermission(false);
        }
        return result;
      },
    }));
    const [running] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: asset.id, expectedVersion: asset.version, profile: "HERO_1600_WEBP" },
    }]);
    const outcome = await runHandler(running);
    assert.deepEqual(outcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
    const rendition = await prisma.mediaRendition.findFirstOrThrow({ where: { sourceAssetId: asset.id } });
    assert.equal(rendition.state, "PROCESSING");
    assert.equal(rendition.claimJobId, running.claim.id);
    assert.equal(rendition.claimLeaseToken, running.claim.leaseToken);
    assert.equal(rendition.claimFencingToken, running.claim.fencingToken);
    assert.equal(rendition.claimExpiresAt instanceof Date, true);
    assert.equal(rendition.readyAt, null);
    assert.equal(provider.hasObject(rendition.objectKey), true);
    await setExecutionStoragePermission(true);
    setStorageProviderForTests(provider);
  });

  await t.test("rendition claims recover only after expiry and stale fencing cannot publish", async () => {
    await resetAutomationRows();
    await setExecutionStoragePermission(true);
    setStorageProviderForTests(provider);
    const recoverableAsset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: recoverableAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const [expiredOwner] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: recoverableAsset.id, expectedVersion: recoverableAsset.version, profile: "HERO_1600_WEBP" },
    }]);
    const expired = await createPendingRendition(recoverableAsset, "HERO_1600_WEBP", provider);
    await prisma.mediaRendition.update({
      where: { id: expired.id },
      data: {
        claimExpiresAt: new Date("2000-01-01T00:00:00.000Z"),
        claimFencingToken: expiredOwner.claim.fencingToken,
        claimJobId: expiredOwner.claim.id,
        claimLeaseToken: expiredOwner.claim.leaseToken,
        state: "PROCESSING",
      },
    });
    const [recovery] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: recoverableAsset.id, expectedVersion: recoverableAsset.version, profile: "HERO_1600_WEBP" },
    }]);
    assert.equal((await runHandler(recovery)).outcome, "SUCCEEDED");
    const recovered = await prisma.mediaRendition.findUniqueOrThrow({ where: { id: expired.id } });
    assert.equal(recovered.state, "READY");
    assert.equal(recovered.claimJobId, null);
    assert.equal(recovered.claimLeaseToken, null);

    await resetAutomationRows();
    setStorageProviderForTests(provider);
    const busyAsset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: busyAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const [busyOwner] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: busyAsset.id, expectedVersion: busyAsset.version, profile: "HERO_1600_WEBP" },
    }]);
    const busy = await createPendingRendition(busyAsset, "HERO_1600_WEBP", provider);
    await prisma.mediaRendition.update({
      where: { id: busy.id },
      data: {
        claimExpiresAt: new Date(Date.now() + 60_000),
        claimFencingToken: busyOwner.claim.fencingToken,
        claimJobId: busyOwner.claim.id,
        claimLeaseToken: busyOwner.claim.leaseToken,
        state: "PROCESSING",
      },
    });
    const [contender] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: busyAsset.id, expectedVersion: busyAsset.version, profile: "HERO_1600_WEBP" },
    }]);
    assert.deepEqual(await runHandler(contender), {
      errorCode: "TRANSIENT_FAILURE",
      outcome: "FAILED",
      retryable: true,
    });
    assert.deepEqual(
      await prisma.mediaRendition.findUniqueOrThrow({
        where: { id: busy.id },
        select: { claimFencingToken: true, claimJobId: true, claimLeaseToken: true, state: true },
      }),
      {
        claimFencingToken: busyOwner.claim.fencingToken,
        claimJobId: busyOwner.claim.id,
        claimLeaseToken: busyOwner.claim.leaseToken,
        state: "PROCESSING",
      },
    );

    await resetAutomationRows();
    setStorageProviderForTests(provider);
    const fencedAsset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: fencedAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const entered = deferred<void>();
    const gate = deferred<void>();
    setStorageProviderForTests(wrapProvider(provider, {
      writeObject: async (input) => {
        entered.resolve();
        await gate.promise;
        return provider.writeObject(input);
      },
    }));
    const [fencedJob] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: fencedAsset.id, expectedVersion: fencedAsset.version, profile: "HERO_1600_WEBP" },
    }]);
    const pending = runHandler(fencedJob);
    await entered.promise;
    const claimed = await prisma.mediaRendition.findFirstOrThrow({ where: { sourceAssetId: fencedAsset.id } });
    assert.equal(claimed.state, "PROCESSING");
    assert.equal(claimed.claimJobId, fencedJob.claim.id);
    assert.equal(claimed.claimLeaseToken, fencedJob.claim.leaseToken);
    assert.equal(claimed.claimFencingToken, fencedJob.claim.fencingToken);
    assert.equal(claimed.claimExpiresAt instanceof Date, true);
    await prisma.mediaRendition.update({
      where: { id: claimed.id },
      data: { claimFencingToken: { increment: BigInt(1) } },
    });
    gate.resolve();
    assert.deepEqual(await pending, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
    const fenced = await prisma.mediaRendition.findUniqueOrThrow({ where: { id: claimed.id } });
    assert.equal(fenced.state, "PROCESSING");
    assert.equal(fenced.readyAt, null);
    assert.equal(fenced.claimFencingToken, fencedJob.claim.fencingToken + BigInt(1));

    await resetAutomationRows();
    setStorageProviderForTests(provider);
    const retryAsset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: retryAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    setStorageProviderForTests(wrapProvider(provider, {
      writeObject: async () => ({ outcome: "TRANSIENT_FAILURE" }),
    }));
    const [retryJob] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: retryAsset.id, expectedVersion: retryAsset.version, profile: "HERO_1600_WEBP" },
    }]);
    assert.deepEqual(await runHandler(retryJob), {
      errorCode: "TRANSIENT_FAILURE",
      outcome: "FAILED",
      retryable: true,
    });
    const retryable = await prisma.mediaRendition.findFirstOrThrow({ where: { sourceAssetId: retryAsset.id } });
    assert.equal(retryable.state, "PENDING");
    assert.equal(retryable.claimJobId, null);
    assert.equal(retryable.claimLeaseToken, null);
    assert.equal(retryable.claimFencingToken, null);
    assert.equal(retryable.claimExpiresAt, null);
    setStorageProviderForTests(provider);
  });

  await t.test("revocation during provider deletes prevents asset and rendition deletion confirmation", async () => {
    await resetAutomationRows();
    await setExecutionStoragePermission(true);
    setStorageProviderForTests(provider);
    const asset = await createAsset(fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "DELETE_PENDING");
    let revoked = false;
    setStorageProviderForTests(wrapProvider(provider, {
      deleteObject: async (input) => {
        const result = await provider.deleteObject(input);
        if (!revoked) {
          revoked = true;
          await setExecutionStoragePermission(false);
        }
        return result;
      },
    }));
    const [assetDelete] = await prepareRunningJobs(context, [{
      jobType: "STORAGE_ASSET_DELETE_RETRY",
      payload: { assetId: asset.id, expectedVersion: asset.version },
    }]);
    assert.deepEqual(await runHandler(assetDelete), {
      errorCode: "PERMANENT_FAILURE",
      outcome: "FAILED",
      retryable: false,
    });
    const retained = await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(retained.state, "DELETE_PENDING");
    assert.equal(retained.deletedAt, null);
    assert.equal(retained.providerCleanupClaimId, assetDelete.claim.leaseToken);
    assert.equal(provider.hasObject(asset.objectKey), false);

    await resetAutomationRows();
    await setExecutionStoragePermission(true);
    setStorageProviderForTests(provider);
    const source = await createAsset(fixture.actors.owner, "BUSINESS_LOGO", sourceBytes, provider, "READY");
    const rendition = await createReadyRendition(source, "CARD_640_WEBP", provider, sourceBytes);
    const superseded = await prisma.mediaRendition.update({
      where: { id: rendition.id },
      data: { state: "SUPERSEDED" },
    });
    revoked = false;
    setStorageProviderForTests(wrapProvider(provider, {
      deleteObject: async (input) => {
        const result = await provider.deleteObject(input);
        if (!revoked) {
          revoked = true;
          await setExecutionStoragePermission(false);
        }
        return result;
      },
    }));
    const [renditionDelete] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_DELETE",
      payload: { expectedVersion: superseded.version, renditionId: superseded.id },
    }]);
    assert.deepEqual(await runHandler(renditionDelete), {
      errorCode: "PERMANENT_FAILURE",
      outcome: "FAILED",
      retryable: false,
    });
    const retainedRendition = await prisma.mediaRendition.findUniqueOrThrow({ where: { id: superseded.id } });
    assert.equal(retainedRendition.state, "DELETE_PENDING");
    assert.equal(retainedRendition.deletedAt, null);
    assert.equal(retainedRendition.claimJobId, renditionDelete.claim.id);
    assert.equal(retainedRendition.claimLeaseToken, renditionDelete.claim.leaseToken);
    assert.equal(provider.hasObject(retainedRendition.objectKey), false);
    await setExecutionStoragePermission(true);
    setStorageProviderForTests(provider);
  });

  await t.test("concurrent rendition discovery creates one child and one bounded READY rendition", async () => {
    await resetAutomationRows();
    const rawErrors: string[] = [];
    setStorageAutomationErrorTestHook((error) => rawErrors.push(String(error)));
    setStorageProviderForTests(provider);
    const asset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: asset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const discovery = await prepareRunningJobs(context, [
      { jobType: "MEDIA_RENDITION_DISCOVERY", payload: { batchSize: 10 } },
      { jobType: "MEDIA_RENDITION_DISCOVERY", payload: { batchSize: 10 } },
    ]);
    const results = await Promise.all(discovery.map(runHandler));
    assert.equal(results.every((result) => result.outcome === "SUCCEEDED"), true);
    await Promise.all(discovery.map((job, index) => settleHandler(job, results[index]!)));
    const children = await prisma.platformJob.findMany({ where: { jobType: "MEDIA_RENDITION_GENERATE" } });
    assert.equal(children.length, 1);
    const [generation] = await claimAndStart(1, context);
    const generated = await runHandler(generation);
    assert.equal(generated.outcome, "SUCCEEDED", JSON.stringify({ generated, rawErrors }));
    await settleHandler(generation, generated);
    const rendition = await prisma.mediaRendition.findFirstOrThrow({ where: { sourceAssetId: asset.id } });
    assert.equal(rendition.state, "READY");
    assert.equal(rendition.profile, "HERO_1600_WEBP");
    assert.ok((rendition.width ?? 0) <= 1_600);
    assert.ok((rendition.height ?? 0) <= 1_600);
    assert.equal(provider.hasObject(rendition.objectKey), true);
    await assert.rejects(prisma.mediaRendition.create({
      data: {
        objectKey: generateMediaRenditionObjectKey(asset.id, "b".repeat(64)),
        profile: rendition.profile,
        provider: rendition.provider,
        sourceAssetId: asset.id,
        sourceAssetVersion: asset.version,
        sourceChecksumSha256: asset.checksumSha256,
        sourceFingerprint: "b".repeat(64),
      },
    }));
    setStorageAutomationErrorTestHook(undefined);
  });

  await t.test("completed renditions cannot starve missing work and legal rows cannot starve cleanup", async () => {
    await resetAutomationRows();
    const completeAsset = await createAsset(
      fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY",
    );
    await attachMedia(fixture.actors.customer, {
      assetId: completeAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    const complete = await createReadyRendition(
      completeAsset, "AVATAR_256_WEBP", provider, sourceBytes,
    );
    const missingAsset = await createAsset(
      fixture.actors.foreignCustomer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY",
    );
    await attachMedia(fixture.actors.foreignCustomer, {
      assetId: missingAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    const [discovery] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_DISCOVERY", payload: { batchSize: 1 },
    }]);
    const discovered = await runHandler(discovery);
    assert.equal(discovered.outcome, "SUCCEEDED");
    const generation = await prisma.platformJob.findFirstOrThrow({
      where: { jobType: "MEDIA_RENDITION_GENERATE" },
    });
    assert.equal((generation.payload as { assetId: string }).assetId, missingAsset.id);

    await resetPlatformRowsOnly();
    const missingContainer = await prisma.mediaContainer.findFirstOrThrow({
      where: { kind: "CUSTOMER_PROFILE", personId: fixture.actors.foreignCustomer.personId },
    });
    const missingBinding = await prisma.mediaBinding.findFirstOrThrow({
      where: { assetId: missingAsset.id, state: "ACTIVE" },
    });
    await detachMedia(fixture.actors.foreignCustomer, {
      bindingId: missingBinding.id,
      expectedVersion: missingContainer.version,
      idempotencyKey: randomUUID(),
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    const stale = await createReadyRendition(
      missingAsset, "AVATAR_256_WEBP", provider, sourceBytes,
    );
    const [cleanup] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_CLEANUP_DISCOVERY", payload: { batchSize: 1 },
    }]);
    const cleaned = await runHandler(cleanup);
    assert.equal(cleaned.outcome, "SUCCEEDED");
    assert.equal((await prisma.mediaRendition.findUniqueOrThrow({ where: { id: complete.id } })).state, "READY");
    assert.equal((await prisma.mediaRendition.findUniqueOrThrow({ where: { id: stale.id } })).state, "SUPERSEDED");
    const deletion = await prisma.platformJob.findFirstOrThrow({
      where: { jobType: "MEDIA_RENDITION_DELETE" },
    });
    assert.equal((deletion.payload as { renditionId: string }).renditionId, stale.id);
  });

  await t.test("a permanent FAILED rendition enters exact deletion even when no output was confirmed", async () => {
    await resetAutomationRows();
    const asset = await createAsset(
      fixture.actors.customer, "CUSTOMER_AVATAR", sourceBytes, provider, "READY",
    );
    const sourceFingerprint = mediaRenditionSourceFingerprint({
      profile: "AVATAR_256_WEBP",
      sourceAssetId: asset.id,
      sourceAssetVersion: asset.version,
      sourceChecksumSha256: asset.checksumSha256,
      sourceProviderObjectVersion: asset.providerObjectVersion,
    });
    const failed = await prisma.mediaRendition.create({
      data: {
        failureCode: "OUTPUT_VERIFICATION_MISMATCH",
        objectKey: generateMediaRenditionObjectKey(asset.id, sourceFingerprint),
        profile: "AVATAR_256_WEBP",
        provider: provider.kind,
        sourceAssetId: asset.id,
        sourceAssetVersion: asset.version,
        sourceChecksumSha256: asset.checksumSha256,
        sourceFingerprint,
        sourceProviderObjectVersion: asset.providerObjectVersion,
        state: "FAILED",
      },
    });
    const [cleanup] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_CLEANUP_DISCOVERY", payload: { batchSize: 1 },
    }]);
    const discovery = await runHandler(cleanup);
    assert.equal(discovery.outcome, "SUCCEEDED");
    await settleHandler(cleanup, discovery);
    const [deletion] = await claimAndStart(1, context);
    const deleted = await runHandler(deletion);
    assert.equal(deleted.outcome, "SUCCEEDED");
    await settleHandler(deletion, deleted);
    const stored = await prisma.mediaRendition.findUniqueOrThrow({ where: { id: failed.id } });
    assert.equal(stored.state, "DELETED");
    assert.equal(stored.failureCode, null);
    assert.equal(stored.mimeType, null);
    assert.equal(stored.deletedAt instanceof Date, true);
  });

  await t.test("delivery prefers READY rendition, falls back to canonical original, and detached media is denied", async () => {
    await resetAutomationRows();
    const asset = await createAsset(fixture.actors.owner, "BUSINESS_LOGO", sourceBytes, provider, "READY");
    let container = await attachMedia(fixture.actors.owner, {
      assetId: asset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const binding = container.bindings.find((item) => item.media?.assetId === asset.id)!;
    const rendition = await createReadyRendition(asset, "CARD_640_WEBP", provider, sourceBytes);
    let downloadedKey = "";
    setStorageProviderForTests(wrapProvider(provider, {
      createDownloadTarget: async (input) => {
        downloadedKey = input.objectKey;
        return provider.createDownloadTarget(input);
      },
    }));
    assert.equal((await createPublicMediaDownloadTarget(asset.id)).assetId, asset.id);
    assert.equal(downloadedKey, rendition.objectKey);
    await prisma.mediaRendition.delete({ where: { id: rendition.id } });
    assert.equal((await createPublicMediaDownloadTarget(asset.id)).assetId, asset.id);
    assert.equal(downloadedKey, asset.objectKey);
    container = await detachMedia(fixture.actors.owner, {
      bindingId: binding.id,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    });
    assert.equal(container.bindings.some((item) => item.id === binding.id), false);
    await assert.rejects(createPublicMediaDownloadTarget(asset.id));
    setStorageProviderForTests(provider);
  });

  await t.test("stale rendition publication is never READY and exact cleanup deletes only its derived key", async () => {
    await resetAutomationRows();
    const asset = await createAsset(fixture.actors.owner, "BUSINESS_COVER", sourceBytes, provider, "READY");
    await attachMedia(fixture.actors.owner, {
      assetId: asset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const entered = deferred<void>();
    const gate = deferred<void>();
    setStorageProviderForTests(wrapProvider(provider, {
      writeObject: async (input) => {
        entered.resolve();
        await gate.promise;
        return provider.writeObject(input);
      },
    }));
    const [running] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_GENERATE",
      payload: { assetId: asset.id, expectedVersion: asset.version, profile: "HERO_1600_WEBP" },
    }]);
    const pending = runHandler(running);
    await entered.promise;
    await prisma.storedAsset.update({ where: { id: asset.id }, data: { version: { increment: 1 } } });
    gate.resolve();
    const outcome = await pending;
    assert.deepEqual(outcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
    const rendition = await prisma.mediaRendition.findFirstOrThrow({ where: { sourceAssetId: asset.id } });
    assert.equal(rendition.state, "SUPERSEDED");
    assert.equal(provider.hasObject(rendition.objectKey), true);
    assert.equal(provider.hasObject(asset.objectKey), true);
    setStorageProviderForTests(provider);
    await resetPlatformRowsOnly();
    const [deleteJob] = await prepareRunningJobs(context, [{
      jobType: "MEDIA_RENDITION_DELETE",
      payload: { expectedVersion: rendition.version, renditionId: rendition.id },
    }]);
    const deleted = await runHandler(deleteJob);
    assert.equal(deleted.outcome, "SUCCEEDED");
    const final = await prisma.mediaRendition.findUniqueOrThrow({ where: { id: rendition.id } });
    assert.equal(final.state, "DELETED");
    assert.equal(provider.hasObject(rendition.objectKey), false);
    assert.equal(provider.hasObject(asset.objectKey), true);
  });
});

async function createAsset(
  actor: StorageActor,
  purpose: StoragePurpose,
  bytes: Uint8Array,
  provider: DeterministicStorageProvider,
  state: "READY" | "QUARANTINED" | "DELETE_PENDING",
) {
  const business = actor.kind === "business";
  const visibility: StorageVisibility = purpose === "CUSTOMER_AVATAR" ? "PRIVATE" : "PUBLIC";
  const objectKey = generateStorageObjectKey(purpose, { environment: "test" });
  provider.putObject({ bytes, contentType: "image/png", objectKey });
  const head = await provider.headObject({ objectKey, provider: provider.kind });
  if (head.outcome !== "READY") throw new Error("Deterministic fixture object was unavailable.");
  const session = await prisma.uploadSession.create({
    data: {
      actorMembershipId: business ? actor.membershipId : null,
      actorPersonId: actor.personId,
      actorRoleId: business ? actor.roleId : null,
      expectedMimeType: "image/png",
      expectedSizeBytes: bytes.byteLength,
      expiresAt: new Date(Date.now() + 60_000),
      finalizedAt: new Date(),
      objectKey,
      organizationId: business ? actor.organizationId : null,
      ownerPersonId: business ? null : actor.personId,
      provider: provider.kind,
      purpose,
      state: "FINALIZED",
      visibility,
    },
  });
  return prisma.storedAsset.create({
    data: {
      checksumSha256: sha256Hex(bytes),
      createdByPersonId: actor.personId,
      deleteRequestedAt: state === "DELETE_PENDING" ? new Date() : null,
      inspectionMetadata: { height: 500, pages: 1, width: 1_000 },
      inspectionOutcome: "VALID",
      inspectionPolicyVersion: state === "QUARANTINED" ? null : STORAGE_INSPECTION_POLICY_VERSION,
      mimeType: "image/png",
      objectKey,
      organizationId: business ? actor.organizationId : null,
      ownerPersonId: business ? null : actor.personId,
      provider: provider.kind,
      providerObjectVersion: head.objectVersion,
      purpose,
      quarantinedAt: state === "QUARANTINED" ? new Date() : null,
      readyAt: state === "READY" || state === "DELETE_PENDING" ? new Date() : null,
      scannerOutcome: "SCANNER_NOT_CONFIGURED",
      sizeBytes: bytes.byteLength,
      state,
      uploadSessionId: session.id,
      visibility,
    },
  });
}

async function createExpiredOrphan(
  actor: StorageActor,
  provider: DeterministicStorageProvider,
  bytes: Uint8Array,
  offsetMs: number,
  createObject = true,
) {
  const objectKey = generateStorageObjectKey("CUSTOMER_AVATAR", { environment: "test" });
  if (createObject) provider.putObject({ bytes, contentType: "image/png", objectKey });
  return prisma.uploadSession.create({
    data: {
      actorPersonId: actor.personId,
      expectedMimeType: "image/png",
      expectedSizeBytes: bytes.byteLength,
      expiresAt: new Date(Date.now() - STORAGE_ORPHAN_RETENTION_MS + offsetMs),
      objectKey,
      ownerPersonId: actor.personId,
      provider: provider.kind,
      purpose: "CUSTOMER_AVATAR",
      state: "EXPIRED",
      visibility: "PRIVATE",
    },
  });
}

async function createPendingRendition(
  asset: Awaited<ReturnType<typeof createAsset>>,
  profile: "AVATAR_256_WEBP" | "CARD_640_WEBP" | "HERO_1600_WEBP",
  provider: DeterministicStorageProvider,
) {
  const sourceFingerprint = mediaRenditionSourceFingerprint({
    profile,
    sourceAssetId: asset.id,
    sourceAssetVersion: asset.version,
    sourceChecksumSha256: asset.checksumSha256,
    sourceProviderObjectVersion: asset.providerObjectVersion,
  });
  return prisma.mediaRendition.create({
    data: {
      objectKey: generateMediaRenditionObjectKey(asset.id, sourceFingerprint),
      profile,
      provider: provider.kind,
      sourceAssetId: asset.id,
      sourceAssetVersion: asset.version,
      sourceChecksumSha256: asset.checksumSha256,
      sourceFingerprint,
      sourceProviderObjectVersion: asset.providerObjectVersion,
      state: "PENDING",
    },
  });
}

async function createReadyRendition(
  asset: Awaited<ReturnType<typeof createAsset>>,
  profile: "AVATAR_256_WEBP" | "CARD_640_WEBP" | "HERO_1600_WEBP",
  provider: DeterministicStorageProvider,
  source: Uint8Array,
) {
  const bytes = await sharp(source).resize({ fit: "inside", height: 128, width: 256 }).webp().toBuffer();
  const sourceFingerprint = mediaRenditionSourceFingerprint({
    profile,
    sourceAssetId: asset.id,
    sourceAssetVersion: asset.version,
    sourceChecksumSha256: asset.checksumSha256,
    sourceProviderObjectVersion: asset.providerObjectVersion,
  });
  const objectKey = generateMediaRenditionObjectKey(asset.id, sourceFingerprint);
  const write = await provider.writeObject({
    bytes,
    checksumSha256: sha256Hex(bytes),
    contentType: "image/webp",
    objectKey,
    provider: provider.kind,
  });
  if (write.outcome !== "READY") throw new Error("Deterministic rendition fixture write failed.");
  return prisma.mediaRendition.create({
    data: {
      checksumSha256: write.checksumSha256,
      height: 128,
      mimeType: "image/webp",
      objectKey,
      profile,
      provider: provider.kind,
      providerObjectVersion: write.objectVersion,
      readyAt: new Date(),
      sizeBytes: write.sizeBytes,
      sourceAssetId: asset.id,
      sourceAssetVersion: asset.version,
      sourceChecksumSha256: asset.checksumSha256,
      sourceFingerprint,
      sourceProviderObjectVersion: asset.providerObjectVersion,
      state: "READY",
      width: 256,
    },
  });
}

async function assertMediaRenditionNullRejected(
  id: string,
  field: "mimeType" | "sizeBytes" | "checksumSha256" | "width" | "height" | "readyAt",
  constraint: RegExp,
) {
  await assert.rejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "MediaRendition"
    SET ${Prisma.raw(`"${field}"`)} = NULL
    WHERE "id" = ${id}::uuid
  `), constraint);
}

async function prepareRunningJobs(
  context: PlatformJobAdminContext,
  inputs: Array<{ jobType: PlatformJobType; payload: unknown }>,
) {
  for (const input of inputs) {
    await runPlatformJobSerializable((transaction) => enqueuePlatformJob(transaction, {
      availableAt: new Date(Date.now() - 1_000),
      createdByAdminUserId: context.userId,
      createdByPersonId: context.personId,
      deduplicationKey: `gate6b:integration:${randomUUID()}`,
      jobType: input.jobType,
      payload: input.payload,
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    }));
  }
  return claimAndStart(inputs.length, context);
}

async function createDiscoveryParent(context: PlatformJobAdminContext, label: string) {
  return (await runPlatformJobSerializable((transaction) => enqueuePlatformJob(transaction, {
    availableAt: new Date(Date.now() + 60_000),
    createdByAdminUserId: context.userId,
    createdByPersonId: context.personId,
    deduplicationKey: `gate6b:integration-parent:${label}:${randomUUID()}`,
    jobType: "STORAGE_MAINTENANCE_DISCOVERY",
    payload: { batchSize: 1 },
    payloadVersion: 1,
    source: "ADMIN_MANUAL",
  }))).job;
}

async function claimAndStart(batchSize: number, context: PlatformJobAdminContext) {
  const operation = await runPlatformJobSerializable(async (transaction) => {
    const idempotencyKey = randomUUID();
    const workerId = `operation:${platformJobHash(idempotencyKey)}`;
    const leaseToken = randomUUID();
    const mutation = await transaction.platformJobMutation.create({
      data: {
        action: "WORKER_BATCH",
        actorAdminUserId: context.userId,
        actorPersonId: context.personId,
        idempotencyKey,
        operationBatchSize: batchSize,
        operationFencingToken: BigInt(1),
        operationLeaseExpiresAt: new Date(Date.now() + 5 * 60_000),
        operationLeaseToken: leaseToken,
        operationWorkerId: workerId,
        requestHash: platformJobHash({ action: "WORKER_BATCH", batchSize }),
        result: { state: "PROCESSING" },
      },
    });
    const authority: PlatformJobOperationAuthority = {
      fencingToken: BigInt(1),
      leaseToken,
      mutationId: mutation.id,
      workerId,
    };
    const claims = await claimPlatformJobsInTransaction(transaction, {
      batchSize,
      operation: authority,
      workerId,
    });
    return { authority, claims };
  });
  const { authority, claims } = operation;
  assert.equal(claims.length, batchSize);
  await Promise.all(claims.map((claim) => startPlatformJob({
    fencingToken: claim.fencingToken,
    jobId: claim.id,
    leaseToken: claim.leaseToken,
    operation: authority,
    workerId: authority.workerId,
  })));
  return claims.map((claim) => ({ claim, operation: authority, workerId: authority.workerId }));
}

function runHandler(job: RunningJob) {
  return executePlatformJobHandler({
    fencingToken: job.claim.fencingToken,
    jobId: job.claim.id,
    jobType: job.claim.jobType,
    leaseToken: job.claim.leaseToken,
    operation: job.operation,
    payload: job.claim.payload,
    payloadVersion: job.claim.payloadVersion,
  });
}

async function settleHandler(job: RunningJob, outcome: Awaited<ReturnType<typeof runHandler>>) {
  if (outcome.outcome === "SUCCEEDED") {
    return completePlatformJob({
      fencingToken: job.claim.fencingToken,
      jobId: job.claim.id,
      leaseToken: job.claim.leaseToken,
      operation: job.operation,
      result: outcome.metadata,
      workerId: job.workerId,
    });
  }
  return failPlatformJob({
    errorCode: outcome.errorCode,
    fencingToken: job.claim.fencingToken,
    jobId: job.claim.id,
    leaseToken: job.claim.leaseToken,
    operation: job.operation,
    retryable: outcome.retryable,
    workerId: job.workerId,
  });
}

async function resetAutomationRows() {
  setStorageMalwareScannerForTests(undefined);
  await prisma.mediaRendition.deleteMany();
  await resetPlatformRowsOnly();
  await prisma.mediaMutation.deleteMany();
  await prisma.mediaBinding.deleteMany();
  await prisma.mediaContainer.deleteMany();
  await prisma.storageMutation.deleteMany();
  await prisma.storedAsset.deleteMany();
  await prisma.uploadSession.deleteMany();
}

async function resetPlatformRowsOnly() {
  await prisma.storedAsset.updateMany({
    data: {
      rescanClaimExpiresAt: null,
      rescanClaimFencingToken: null,
      rescanClaimJobId: null,
      rescanClaimLeaseToken: null,
    },
  });
  await prisma.mediaRendition.updateMany({
    data: {
      claimExpiresAt: null,
      claimFencingToken: null,
      claimJobId: null,
      claimLeaseToken: null,
    },
  });
  await prisma.platformJobMutation.deleteMany();
  await prisma.platformJobAttempt.deleteMany();
  await prisma.platformJob.deleteMany({ where: { parentJobId: { not: null } } });
  await prisma.platformJob.deleteMany();
  await prisma.platformJobSchedule.deleteMany();
}

function wrapProvider(provider: DeterministicStorageProvider, overrides: Partial<StorageProvider>): StorageProvider {
  return {
    kind: provider.kind,
    createDownloadTarget: provider.createDownloadTarget.bind(provider),
    createUploadTarget: provider.createUploadTarget.bind(provider),
    deleteObject: provider.deleteObject.bind(provider),
    getObjectForInspection: provider.getObjectForInspection.bind(provider),
    headObject: provider.headObject.bind(provider),
    writeObject: provider.writeObject.bind(provider),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function platformCode(expected: string) {
  return (error: unknown) => error instanceof PlatformJobDomainError && error.code === expected;
}
