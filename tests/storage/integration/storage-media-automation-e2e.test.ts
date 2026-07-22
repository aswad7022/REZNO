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
import {
  claimPlatformJobs,
  completePlatformJob,
  enqueuePlatformJob,
  failPlatformJob,
  startPlatformJob,
  type ClaimedPlatformJob,
} from "../../../features/platform-jobs/services/jobs";
import type { PlatformJobAdminContext } from "../../../features/platform-jobs/services/admin-context";
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

type RunningJob = { claim: ClaimedPlatformJob; workerId: string };

test("Gate 6B storage and media automation is durable, fenced, and exact", { concurrency: false }, async (t) => {
  await resetStorageTestDatabase();
  t.after(async () => {
    setStorageAutomationErrorTestHook(undefined);
    setStorageMalwareScannerForTests(undefined);
    setStorageProviderForTests(undefined);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("Migration 45 is healthy, schema-only, indexed, and constrained", async () => {
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
      applied: BigInt(45), failed: BigInt(0), rolledBack: BigInt(0), total: BigInt(45),
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
  const provider = new DeterministicStorageProvider();
  setStorageProviderForTests(provider);
  const sourceBytes = await sharp({
    create: { background: "#2457a6", channels: 3, height: 500, width: 1_000 },
  }).png().toBuffer();

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
    [running] = await claimAndStart(1);
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
    const [running] = await claimAndStart(1);
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
    const [generation] = await claimAndStart(1);
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
    const [deletion] = await claimAndStart(1);
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
  return claimAndStart(inputs.length);
}

async function claimAndStart(batchSize: number) {
  const workerId = `worker:gate6b:${randomUUID()}`;
  const claims = await claimPlatformJobs({ batchSize, workerId });
  assert.equal(claims.length, batchSize);
  await Promise.all(claims.map((claim) => startPlatformJob({
    fencingToken: claim.fencingToken,
    jobId: claim.id,
    leaseToken: claim.leaseToken,
    workerId,
  })));
  return claims.map((claim) => ({ claim, workerId }));
}

function runHandler(job: RunningJob) {
  return executePlatformJobHandler({
    fencingToken: job.claim.fencingToken,
    jobId: job.claim.id,
    jobType: job.claim.jobType,
    leaseToken: job.claim.leaseToken,
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
      result: outcome.metadata,
      workerId: job.workerId,
    });
  }
  return failPlatformJob({
    errorCode: outcome.errorCode,
    fencingToken: job.claim.fencingToken,
    jobId: job.claim.id,
    leaseToken: job.claim.leaseToken,
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
