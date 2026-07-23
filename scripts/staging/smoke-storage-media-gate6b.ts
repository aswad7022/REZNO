import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Prisma, type PlatformJobType } from "@prisma/client";
import sharp from "sharp";

import {
  generateMediaRenditionObjectKey,
  mediaRenditionSourceFingerprint,
} from "../../features/media/domain/rendition-registry";
import { createPrivateAvatarDownloadTarget } from "../../features/media/services/delivery";
import { platformJobHash } from "../../features/platform-jobs/domain/canonical";
import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../features/platform-jobs/domain/errors";
import { platformHealthPayload } from "../../features/platform-jobs/domain/registry";
import { executePlatformJobHandler } from "../../features/platform-jobs/services/handlers";
import {
  claimPlatformJobsInTransaction,
  completePlatformJob,
  enqueueDomainDiscoveryPlatformJob,
  enqueuePlatformJob,
  failPlatformJob,
  startPlatformJob,
  type ClaimedPlatformJob,
} from "../../features/platform-jobs/services/jobs";
import type { PlatformJobOperationAuthority } from "../../features/platform-jobs/services/operation-lease";
import { runPlatformSchedulerTick, setPlatformJobScheduleEnabled } from "../../features/platform-jobs/services/schedules";
import { runPlatformJobSerializable } from "../../features/platform-jobs/services/transaction";
import { runPlatformWorkerBatch } from "../../features/platform-jobs/services/worker";
import { DeterministicStorageProvider } from "../../features/storage/providers/deterministic";
import { configuredStorageProvider, setStorageProviderForTests } from "../../features/storage/providers/registry";
import { setStorageMalwareScannerForTests } from "../../features/storage/services/storage-mutations";
import {
  requestStoredAssetRescan,
  storageAutomationStatus,
} from "../../features/storage-automation/services/admin";
import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  STORAGE_MEDIA_GATE6B_MARKER,
  STORAGE_MEDIA_GATE6B_SOURCE_BYTES,
  seedStorageMediaGate6bFixture,
  storageMediaGate6bFixtureFingerprint,
  storageMediaGate6bFixtureIds as ids,
  storageMediaGate6bForeignSentinels,
  storageMediaGate6bNonFixtureFingerprint,
} from "./storage-media-gate6b-fixture";
import { assertStorageMediaGate6bStaging } from "./storage-media-gate6b-safety";

type RunningJob = {
  claim: ClaimedPlatformJob;
  operation: PlatformJobOperationAuthority;
  workerId: string;
};
let smokePhase = "BOOT";
let smokeDiagnostic: unknown = null;

const context = {
  adminAccessId: ids.adminAccessId,
  personId: ids.adminPersonId,
  source: "database" as const,
  userId: ids.adminUserId,
};
const storageAdmin = {
  adminAccessId: ids.adminAccessId,
  kind: "admin" as const,
  personId: ids.adminPersonId,
  source: "database" as const,
  userId: ids.adminUserId,
};
const customer = {
  kind: "customer" as const,
  personId: ids.customerPersonId,
  userId: ids.customerUserId,
};

async function main() {
  smokePhase = "SAFETY";
  const transport = process.env.REZNO_STAGE6_GATE6B_ALLOW_LOCAL_UNENCRYPTED === "true"
    ? undefined
    : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertStorageMediaGate6bStaging(prisma, process.env, transport);
  await seedStorageMediaGate6bFixture(prisma);
  const nonFixtureBefore = await storageMediaGate6bNonFixtureFingerprint(prisma);
  const sentinelsBefore = await storageMediaGate6bForeignSentinels(prisma);
  let checks = 0;

  smokePhase = "RUNTIME_TRUTH";
  assert.equal(configuredStorageProvider().kind, "NOT_CONFIGURED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.automaticScheduler, "NOT_CONNECTED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.alwaysOnWorker, "NOT_CONNECTED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.externalQueueProvider, "NOT_CONFIGURED");
  checks += 4;

  const provider = new DeterministicStorageProvider();
  smokePhase = "PROVIDER_FIXTURE";
  setStorageProviderForTests(provider);
  await populateProvider(provider);
  assert.equal("listObjects" in provider, false);
  checks += 1;

  const status = await storageAutomationStatus(context, storageAdmin);
  smokePhase = "STATUS";
  assert.equal(status.provider, "DETERMINISTIC_TEST");
  assert.equal(status.scanner, "SCANNER_NOT_CONFIGURED");
  assert.equal(status.jobTypes.length, 9);
  assert.equal(status.scheduleKeys.length, 4);
  assert.equal(status.renditionProfiles.length, 3);
  assert.equal(JSON.stringify(status).includes("objectKey"), false);
  assert.equal(JSON.stringify(status).includes("signed"), false);
  checks += 7;

  smokePhase = "EXECUTION_AUTHORITY";
  await resetFixtureJobs();
  const originalPermissions = (await prisma.adminAccess.findUniqueOrThrow({
    where: { id: ids.adminAccessId },
    select: { permissions: true },
  })).permissions;
  const healthJob = await enqueueSmokeJob("PLATFORM_HEALTH_PROBE", platformHealthPayload());
  const filteredGate6bJob = await enqueueSmokeJob("STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 1 });
  await setFixturePermissions(["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"]);
  const mixed = await runPlatformWorkerBatch(context, { batchSize: 2, idempotencyKey: randomUUID() });
  assert.equal(mixed.state, "COMPLETE");
  if (mixed.state !== "COMPLETE") throw new Error("The mixed worker did not complete.");
  assert.equal(mixed.claimed, 1);
  assert.equal(mixed.succeeded, 1);
  assert.equal((await prisma.platformJob.findUniqueOrThrow({ where: { id: healthJob.id } })).status, "SUCCEEDED");
  assert.deepEqual(
    await prisma.platformJob.findUniqueOrThrow({
      where: { id: filteredGate6bJob.id },
      select: { attemptCount: true, status: true },
    }),
    { attemptCount: 0, status: "AVAILABLE" },
  );
  assert.doesNotMatch(JSON.stringify(mixed), /actor|person|permission|operation|lease|fencing|workerId/iu);
  await setFixturePermissions(originalPermissions);
  const authorizedClaim = await claimExistingJob(filteredGate6bJob.id);
  assert.equal(authorizedClaim.claim.id, filteredGate6bJob.id);
  assert.equal(authorizedClaim.claim.jobType, "STORAGE_MAINTENANCE_DISCOVERY");
  await resetFixtureJobs();
  await enqueueSmokeJob("PLATFORM_HEALTH_PROBE", platformHealthPayload());
  await setFixturePermissions(["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"]);
  await assert.rejects(
    runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: randomUUID() }),
    (error: unknown) => error instanceof PlatformJobDomainError && error.code === "FORBIDDEN",
  );
  await setFixturePermissions(originalPermissions);
  checks += 10;

  smokePhase = "SCHEDULE_AUTHORITY";
  await resetFixtureJobs();
  const schedule = await prisma.platformJobSchedule.findFirstOrThrow({
    where: { createdByAdminUserId: ids.adminUserId, scheduleKey: "STORAGE_MAINTENANCE_DISCOVERY" },
  });
  await setFixturePermissions(["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"]);
  await assert.rejects(setPlatformJobScheduleEnabled(context, {
    enabled: true,
    expectedVersion: schedule.version,
    idempotencyKey: randomUUID(),
    scheduleId: schedule.id,
  }), (error: unknown) => error instanceof PlatformJobDomainError && error.code === "FORBIDDEN");
  await setFixturePermissions(originalPermissions);
  const enabledSchedule = await setPlatformJobScheduleEnabled(context, {
    enabled: true,
    expectedVersion: schedule.version,
    idempotencyKey: randomUUID(),
    scheduleId: schedule.id,
  });
  if (enabledSchedule.replay) throw new Error("Fresh staging schedule enable unexpectedly replayed.");
  await setFixturePermissions(["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"]);
  const filteredTick = await runPlatformSchedulerTick(context, {
    batchSize: 1,
    idempotencyKey: randomUUID(),
    now: new Date("2026-07-24T00:00:00Z"),
  });
  if (filteredTick.replay) throw new Error("Fresh staging scheduler tick unexpectedly replayed.");
  assert.equal(filteredTick.jobsCreated, 0);
  assert.equal(filteredTick.schedulesProcessed, 0);
  await setFixturePermissions(originalPermissions);
  const disabledSchedule = await setPlatformJobScheduleEnabled(context, {
    enabled: false,
    expectedVersion: enabledSchedule.version,
    idempotencyKey: randomUUID(),
    scheduleId: schedule.id,
  });
  if (disabledSchedule.replay) throw new Error("Fresh staging schedule disable unexpectedly replayed.");
  assert.equal(disabledSchedule.enabled, false);
  checks += 5;

  smokePhase = "RENDITION_CLAIM_MATRIX";
  await resetFixtureJobs();
  await prisma.mediaRendition.deleteMany({ where: { sourceAssetId: { in: Object.values(ids.assets) } } });
  const claimOwner = await prepareRunningJob("MEDIA_RENDITION_GENERATE", {
    assetId: ids.assets.renditionSource,
    expectedVersion: 1,
    profile: "AVATAR_256_WEBP",
  });
  const claimSource = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.renditionSource } });
  const claimFingerprint = mediaRenditionSourceFingerprint({
    profile: "AVATAR_256_WEBP",
    sourceAssetId: claimSource.id,
    sourceAssetVersion: claimSource.version,
    sourceChecksumSha256: claimSource.checksumSha256,
    sourceProviderObjectVersion: claimSource.providerObjectVersion,
  });
  const pendingRendition = await prisma.mediaRendition.create({
    data: {
      objectKey: generateMediaRenditionObjectKey(claimSource.id, claimFingerprint),
      profile: "AVATAR_256_WEBP",
      provider: claimSource.provider,
      sourceAssetId: claimSource.id,
      sourceAssetVersion: claimSource.version,
      sourceChecksumSha256: claimSource.checksumSha256,
      sourceFingerprint: claimFingerprint,
      sourceProviderObjectVersion: claimSource.providerObjectVersion,
      state: "PENDING",
    },
  });
  await assert.rejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "MediaRendition" SET "state" = 'PROCESSING' WHERE "id" = ${pendingRendition.id}::uuid
  `), /MediaRendition_claim_check/u);
  await assert.rejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "MediaRendition"
    SET "state" = 'PROCESSING', "claimJobId" = ${claimOwner.claim.id}::uuid
    WHERE "id" = ${pendingRendition.id}::uuid
  `), /MediaRendition_claim_check/u);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "MediaRendition"
    SET "state" = 'PROCESSING', "claimJobId" = ${claimOwner.claim.id}::uuid,
        "claimLeaseToken" = ${claimOwner.claim.leaseToken}::uuid,
        "claimFencingToken" = ${claimOwner.claim.fencingToken},
        "claimExpiresAt" = ${claimOwner.claim.leaseExpiresAt}
    WHERE "id" = ${pendingRendition.id}::uuid
  `);
  const validClaim = await prisma.mediaRendition.findUniqueOrThrow({ where: { id: pendingRendition.id } });
  assert.equal(validClaim.state, "PROCESSING");
  assert.equal(validClaim.claimJobId, claimOwner.claim.id);
  checks += 4;
  await prisma.mediaRendition.delete({ where: { id: pendingRendition.id } });
  await resetFixtureJobs();

  smokePhase = "CROSS_ADMIN_DOMAIN_DEDUPE";
  const secondUserId = `${STORAGE_MEDIA_GATE6B_MARKER}-dedupe-${randomUUID()}`;
  const secondUser = await prisma.user.create({
    data: { email: `${secondUserId}@rezno.invalid`, id: secondUserId, name: "Gate 6B Dedupe" },
  });
  const secondPerson = await prisma.person.create({
    data: { authUserId: secondUser.id, firstName: "Gate6B", isOnboarded: true, status: "ACTIVE" },
  });
  const secondAccess = await prisma.adminAccess.create({
    data: { permissions: originalPermissions, userId: secondUser.id },
  });
  const crossAdminJobIds: string[] = [];
  try {
    smokeDiagnostic = { crossAdminStep: "PARENTS" };
    const [firstParent, secondParent] = await Promise.all([
      enqueueSmokeJob("STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 1 }),
      enqueueSmokeJobForActor(secondUser.id, secondPerson.id, "STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 1 }),
    ]);
    crossAdminJobIds.push(firstParent.id, secondParent.id);
    const availableAt = new Date("2026-07-22T12:00:00.123Z");
    const cases = [
      { jobType: "STORAGE_ORPHAN_CLEANUP" as const, payload: { expectedVersion: 1, uploadSessionId: randomUUID() } },
      { jobType: "STORAGE_ASSET_DELETE_RETRY" as const, payload: { assetId: randomUUID(), expectedVersion: 1 } },
      { jobType: "STORAGE_ASSET_RESCAN" as const, payload: { assetId: randomUUID(), expectedVersion: 1 } },
      { jobType: "MEDIA_RENDITION_GENERATE" as const, payload: { assetId: randomUUID(), expectedVersion: 1, profile: "CARD_640_WEBP" } },
    ];
    for (const [index, item] of cases.entries()) {
      smokeDiagnostic = { crossAdminStep: "CHILD", index, jobType: item.jobType };
      const deduplicationKey = `staging:gate6b:cross-admin:${index}:${randomUUID()}`;
      const [first, second] = await Promise.all([
        runPlatformJobSerializable((transaction) => enqueueDomainDiscoveryPlatformJob(transaction, {
          availableAt,
          createdByAdminUserId: ids.adminUserId,
          createdByPersonId: ids.adminPersonId,
          deduplicationKey,
          jobType: item.jobType,
          parentJobId: firstParent.id,
          payload: item.payload,
          payloadVersion: 1,
        })),
        runPlatformJobSerializable((transaction) => enqueueDomainDiscoveryPlatformJob(transaction, {
          availableAt,
          createdByAdminUserId: secondUser.id,
          createdByPersonId: secondPerson.id,
          deduplicationKey,
          jobType: item.jobType,
          parentJobId: secondParent.id,
          payload: item.payload,
          payloadVersion: 1,
        })),
      ]);
      assert.equal(Number(first.replay) + Number(second.replay), 1);
      assert.equal(first.job.id, second.job.id);
      crossAdminJobIds.push(first.job.id);
      checks += 2;
    }
  } finally {
    await prisma.platformJob.deleteMany({ where: { id: { in: crossAdminJobIds } } });
    await prisma.adminAccess.deleteMany({ where: { id: secondAccess.id } });
    await prisma.person.deleteMany({ where: { id: secondPerson.id } });
    await prisma.user.deleteMany({ where: { id: secondUser.id } });
  }
  smokeDiagnostic = { crossAdminStep: "RESEED" };
  await seedStorageMediaGate6bFixture(prisma);

  smokePhase = "REVOCATION_DURING_PROVIDER_DELETE";
  await resetFixtureJobs();
  setStorageProviderForTests(proxyProvider(provider, async () => {
    await setFixturePermissions(["STORAGE_RECORDS_VIEW", "PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"]);
    return { outcome: "READY" as const };
  }));
  const deleteTarget = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.deletePending } });
  const revokedDelete = await prepareRunningJob("STORAGE_ASSET_DELETE_RETRY", {
    assetId: deleteTarget.id,
    expectedVersion: deleteTarget.version,
  });
  const revokedDeleteOutcome = await runHandler(revokedDelete);
  assert.deepEqual(revokedDeleteOutcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
  const retainedDelete = await prisma.storedAsset.findUniqueOrThrow({ where: { id: deleteTarget.id } });
  assert.equal(retainedDelete.state, "DELETE_PENDING");
  assert.equal(retainedDelete.deletedAt, null);
  await setFixturePermissions(originalPermissions);
  setStorageProviderForTests(provider);
  await prisma.storedAsset.update({
    where: { id: deleteTarget.id },
    data: { providerCleanupClaimId: null, providerCleanupClaimedAt: null },
  });
  await resetFixtureJobs();
  checks += 3;

  smokePhase = "REVOCATION_DURING_PROVIDER_RESCAN";
  const revocationProvider = proxyProvider(provider);
  setStorageProviderForTests({
    ...revocationProvider,
    getObjectForInspection: async (input) => {
      const result = await provider.getObjectForInspection(input);
      await setFixturePermissions(["STORAGE_RECORDS_VIEW", "PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"]);
      return result;
    },
  });
  const rescanTarget = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.quarantined } });
  const revokedRescan = await prepareRunningJob("STORAGE_ASSET_RESCAN", {
    assetId: rescanTarget.id,
    expectedVersion: rescanTarget.version,
  });
  const revokedRescanOutcome = await runHandler(revokedRescan);
  assert.deepEqual(revokedRescanOutcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
  const retainedRescan = await prisma.storedAsset.findUniqueOrThrow({ where: { id: rescanTarget.id } });
  assert.equal(retainedRescan.state, "QUARANTINED");
  assert.equal(retainedRescan.lastRescannedAt, null);
  await setFixturePermissions(originalPermissions);
  setStorageProviderForTests(provider);
  await resetFixtureJobs();
  checks += 3;

  smokePhase = "REVOCATION_DURING_RENDITION_WRITE";
  await prisma.mediaRendition.deleteMany({ where: { sourceAssetId: ids.assets.renditionSource } });
  setStorageProviderForTests({
    ...proxyProvider(provider),
    writeObject: async (input) => {
      const result = await provider.writeObject(input);
      await setFixturePermissions(["STORAGE_RECORDS_VIEW", "PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"]);
      return result;
    },
  });
  const renditionTarget = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.renditionSource } });
  const revokedWrite = await prepareRunningJob("MEDIA_RENDITION_GENERATE", {
    assetId: renditionTarget.id,
    expectedVersion: renditionTarget.version,
    profile: "AVATAR_256_WEBP",
  });
  const revokedWriteOutcome = await runHandler(revokedWrite);
  smokeDiagnostic = { revokedWriteOutcome };
  assert.deepEqual(revokedWriteOutcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
  const retainedWrite = await prisma.mediaRendition.findFirstOrThrow({ where: { sourceAssetId: renditionTarget.id } });
  assert.equal(retainedWrite.state, "PROCESSING");
  assert.equal(retainedWrite.readyAt, null);
  assert.equal(retainedWrite.claimJobId, revokedWrite.claim.id);
  await setFixturePermissions(originalPermissions);
  setStorageProviderForTests(provider);
  await prisma.mediaRendition.deleteMany({ where: { sourceAssetId: renditionTarget.id } });
  await resetFixtureJobs();
  checks += 4;

  await resetFixtureJobs();
  smokePhase = "MAINTENANCE_DISCOVERY";
  const maintenance = await prepareRunningJob("STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 2 });
  const duplicateMaintenance = await prepareRunningJob("STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 2 });
  const discoveries = [await runHandler(maintenance), await runHandler(duplicateMaintenance)];
  smokeDiagnostic = { discoveries };
  assert.equal(discoveries.every((result) => result.outcome === "SUCCEEDED"), true);
  await Promise.all([
    settleHandler(maintenance, discoveries[0]!),
    settleHandler(duplicateMaintenance, discoveries[1]!),
  ]);
  const maintenanceChildren = await prisma.platformJob.findMany({
    where: {
      createdByAdminUserId: ids.adminUserId,
      jobType: { in: ["STORAGE_ORPHAN_CLEANUP", "STORAGE_ASSET_DELETE_RETRY"] },
      parentJobId: { not: null },
    },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
  });
  smokeDiagnostic = {
    childTypes: maintenanceChildren.map((job) => job.jobType),
    discoveries,
  };
  assert.equal(maintenanceChildren.length, 2);
  assert.equal(new Set(maintenanceChildren.map((job) => job.deduplicationKey)).size, 2);
  assert.equal(
    maintenanceChildren.some((job) => (job.payload as { uploadSessionId?: string }).uploadSessionId === ids.sessions.retainedOrphan),
    false,
  );
  assert.equal(
    maintenanceChildren.some((job) => (job.payload as { assetId?: string }).assetId === ids.assets.activeBound),
    false,
  );
  checks += 5;

  const orphanJobId = maintenanceChildren.find((job) => job.jobType === "STORAGE_ORPHAN_CLEANUP")!.id;
  smokePhase = "ORPHAN_CLEANUP";
  const orphan = await claimExistingJob(orphanJobId);
  let deleteCalls = 0;
  const countedProvider = proxyProvider(provider, async (input) => {
    deleteCalls += 1;
    return provider.deleteObject(input);
  });
  setStorageProviderForTests(countedProvider);
  const orphanOutcomes = [await runHandler(orphan), await runHandler(orphan)];
  smokeDiagnostic = { deleteCalls, orphanOutcomes };
  const orphanSuccess = orphanOutcomes.find((outcome) => outcome.outcome === "SUCCEEDED")!;
  assert.ok(orphanSuccess);
  assert.equal(deleteCalls, 1);
  await settleHandler(orphan, orphanSuccess);
  assert.equal(
    (await prisma.uploadSession.findUniqueOrThrow({ where: { id: ids.sessions.dueOrphan } })).failureCode,
    "ORPHAN_OBJECT_DELETED",
  );
  checks += 3;

  setStorageProviderForTests(provider);
  smokePhase = "ASSET_DELETE";
  const assetDeleteJobId = maintenanceChildren.find((job) => job.jobType === "STORAGE_ASSET_DELETE_RETRY")!.id;
  const deleteAsset = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.deletePending } });
  provider.setDeleteOutcomes(deleteAsset.objectKey, ["TRANSIENT_FAILURE", "READY"]);
  let assetDeleteJob = await claimExistingJob(assetDeleteJobId);
  const transient = await runHandler(assetDeleteJob);
  assert.deepEqual(transient, { errorCode: "TRANSIENT_FAILURE", outcome: "FAILED", retryable: true });
  await settleHandler(assetDeleteJob, transient);
  assert.equal((await prisma.storedAsset.findUniqueOrThrow({ where: { id: deleteAsset.id } })).state, "DELETE_PENDING");
  await prisma.platformJob.update({ where: { id: assetDeleteJobId }, data: { availableAt: new Date("2000-01-01T00:00:00Z") } });
  assetDeleteJob = await claimExistingJob(assetDeleteJobId);
  const deleted = await runHandler(assetDeleteJob);
  assert.equal(deleted.outcome, "SUCCEEDED");
  await settleHandler(assetDeleteJob, deleted);
  assert.equal((await prisma.storedAsset.findUniqueOrThrow({ where: { id: deleteAsset.id } })).state, "DELETED");
  assert.equal(provider.hasObject(deleteAsset.objectKey), false);
  checks += 6;

  await clearQueuedFixtureJobs();
  smokePhase = "RESCAN_DISCOVERY";
  const rescanDiscovery = await prepareRunningJob("STORAGE_RESCAN_DISCOVERY", { batchSize: 1 });
  const discoveredRescan = await runHandler(rescanDiscovery);
  assert.equal(discoveredRescan.outcome, "SUCCEEDED");
  await settleHandler(rescanDiscovery, discoveredRescan);
  const rescanChildren = await prisma.platformJob.findMany({
    where: { createdByAdminUserId: ids.adminUserId, jobType: "STORAGE_ASSET_RESCAN", parentJobId: { not: null } },
  });
  assert.equal(rescanChildren.length, 1);
  assert.equal((rescanChildren[0]!.payload as { assetId: string }).assetId, ids.assets.quarantined);
  assert.equal(
    rescanChildren.some((job) => (job.payload as { assetId: string }).assetId === ids.assets.explicitReady),
    false,
  );
  const rescan = await claimExistingJob(rescanChildren[0]!.id);
  const rescanOutcomes = [await runHandler(rescan), await runHandler(rescan)];
  const rescanSuccess = rescanOutcomes.find((outcome) => outcome.outcome === "SUCCEEDED")!;
  assert.ok(rescanSuccess);
  await settleHandler(rescan, rescanSuccess);
  const rescanned = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.quarantined } });
  assert.equal(rescanned.state, "READY");
  assert.equal(rescanned.scannerOutcome, "SCANNER_NOT_CONFIGURED");
  assert.equal(rescanned.rescanClaimJobId, null);
  checks += 8;

  const explicitAsset = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.explicitReady } });
  smokePhase = "STALE_EXPLICIT_RESCAN";
  const explicitRequest = await requestStoredAssetRescan(context, storageAdmin, {
    assetId: explicitAsset.id,
    expectedVersion: explicitAsset.version,
    idempotencyKey: randomUUID(),
  });
  assert.equal(explicitRequest.replay, false);
  await prisma.storedAsset.update({ where: { id: explicitAsset.id }, data: { version: { increment: 1 } } });
  const staleRescan = await claimExistingJob(explicitRequest.jobId);
  const staleRescanOutcome = await runHandler(staleRescan);
  assert.equal(staleRescanOutcome.outcome, "SUCCEEDED");
  if (staleRescanOutcome.outcome === "SUCCEEDED") {
    assert.equal((staleRescanOutcome.metadata as { outcome: string }).outcome, "STALE");
  }
  await settleHandler(staleRescan, staleRescanOutcome);
  checks += 3;

  await clearQueuedFixtureJobs();
  smokePhase = "RENDITION_GENERATION";
  await prisma.mediaRendition.deleteMany({ where: { sourceAssetId: { in: Object.values(ids.assets) } } });
  const renditionDiscovery = await prepareRunningJob("MEDIA_RENDITION_DISCOVERY", { batchSize: 1 });
  const renditionDiscovered = await runHandler(renditionDiscovery);
  assert.equal(renditionDiscovered.outcome, "SUCCEEDED");
  await settleHandler(renditionDiscovery, renditionDiscovered);
  const renditionChildren = await prisma.platformJob.findMany({
    where: { createdByAdminUserId: ids.adminUserId, jobType: "MEDIA_RENDITION_GENERATE", parentJobId: { not: null } },
  });
  assert.equal(renditionChildren.length, 1);
  assert.equal((renditionChildren[0]!.payload as { assetId: string }).assetId, ids.assets.renditionSource);
  const generation = await claimExistingJob(renditionChildren[0]!.id);
  const generated = await runHandler(generation);
  assert.equal(generated.outcome, "SUCCEEDED");
  await settleHandler(generation, generated);
  const rendition = await prisma.mediaRendition.findFirstOrThrow({
    where: { sourceAssetId: ids.assets.renditionSource, state: "READY" },
  });
  assert.equal(rendition.profile, "AVATAR_256_WEBP");
  assert.ok((rendition.width ?? 0) <= 256 && (rendition.height ?? 0) <= 256);
  assert.ok((rendition.sizeBytes ?? BigInt(0)) > BigInt(0) && (rendition.sizeBytes ?? BigInt(0)) <= BigInt(4 * 1024 * 1024));
  const output = await provider.getObjectForInspection({
    maxBytes: 4 * 1024 * 1024,
    objectKey: rendition.objectKey,
    provider: provider.kind,
  });
  assert.equal(output.outcome, "READY");
  if (output.outcome !== "READY") throw new Error("Rendition output was unavailable.");
  const metadata = await sharp(output.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  checks += 10;

  let deliveredKey = "";
  smokePhase = "RENDITION_DELIVERY";
  setStorageProviderForTests({
    ...proxyProvider(provider),
    createDownloadTarget: async (input) => {
      deliveredKey = input.objectKey;
      return provider.createDownloadTarget(input);
    },
  });
  const delivered = await createPrivateAvatarDownloadTarget(customer, ids.assets.renditionSource);
  assert.equal(delivered.assetId, ids.assets.renditionSource);
  assert.equal(deliveredKey, rendition.objectKey);
  await prisma.mediaRendition.update({ where: { id: rendition.id }, data: { state: "SUPERSEDED" } });
  await createPrivateAvatarDownloadTarget(customer, ids.assets.renditionSource);
  const source = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.renditionSource } });
  assert.equal(deliveredKey, source.objectKey);
  checks += 3;

  setStorageProviderForTests(provider);
  smokePhase = "RENDITION_DELETE";
  await clearQueuedFixtureJobs();
  const renditionDelete = await prepareRunningJob("MEDIA_RENDITION_DELETE", {
    expectedVersion: rendition.version,
    renditionId: rendition.id,
  });
  const renditionDeleted = await runHandler(renditionDelete);
  assert.equal(renditionDeleted.outcome, "SUCCEEDED");
  await settleHandler(renditionDelete, renditionDeleted);
  assert.equal((await prisma.mediaRendition.findUniqueOrThrow({ where: { id: rendition.id } })).state, "DELETED");
  assert.equal(provider.hasObject(rendition.objectKey), false);
  assert.equal(provider.hasObject(source.objectKey), true);
  checks += 4;

  const activeBound = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assets.activeBound } });
  assert.equal(activeBound.state, "DELETE_PENDING");
  assert.equal(provider.hasObject(activeBound.objectKey), true);
  checks += 2;

  setStorageProviderForTests(undefined);
  smokePhase = "NO_PROVIDER";
  const noProvider = await prepareRunningJob("STORAGE_ASSET_RESCAN", {
    assetId: rescanned.id,
    expectedVersion: rescanned.version,
  });
  const noProviderOutcome = await runHandler(noProvider);
  assert.deepEqual(noProviderOutcome, { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false });
  await settleHandler(noProvider, noProviderOutcome);
  checks += 2;

  const scheduler = await runPlatformSchedulerTick(context, {
    batchSize: 10,
    idempotencyKey: randomUUID(),
    now: new Date("2026-07-23T00:00:00Z"),
  });
  assert.equal(scheduler.replay, false);
  if (scheduler.replay) throw new Error("Fresh Gate 6B scheduler smoke unexpectedly replayed.");
  assert.equal(scheduler.jobsCreated, 0);
  assert.equal(await prisma.platformJobSchedule.count({ where: { createdByAdminUserId: ids.adminUserId, enabled: true } }), 0);
  checks += 3;

  await prisma.adminAccess.update({ where: { id: ids.adminAccessId }, data: { status: "REVOKED" } });
  smokePhase = "ADMIN_REVOCATION";
  try {
    await assert.rejects(storageAutomationStatus(context, storageAdmin), (error: unknown) => (
      error instanceof PlatformJobDomainError && error.code === "FORBIDDEN"
    ));
  } finally {
    await prisma.adminAccess.update({ where: { id: ids.adminAccessId }, data: { status: "ACTIVE" } });
  }
  checks += 1;

  const nonFixtureAfter = await storageMediaGate6bNonFixtureFingerprint(prisma);
  smokePhase = "FINGERPRINT";
  const sentinelsAfter = await storageMediaGate6bForeignSentinels(prisma);
  assert.equal(nonFixtureAfter, nonFixtureBefore);
  assert.deepEqual(sentinelsAfter, sentinelsBefore);
  checks += 2;

  console.log(JSON.stringify({
    ...safety,
    checks,
    fixture: STORAGE_MEDIA_GATE6B_MARKER,
    fixtureEvidence: await storageMediaGate6bFixtureFingerprint(prisma),
    foreignSentinels: sentinelsAfter,
    nonFixtureFingerprint: nonFixtureAfter,
    regressionCoverage: {
      gate5a: "exact cleanup, retention, provider confirmation, quota state",
      gate5b: "binding isolation, rendition preference, original fallback, detached history",
      gate6a: "claim, fencing, retry, dead-letter, schedule disablement, Admin revocation",
    },
    runtime: STAGE_6_ARCHITECTURE.runtime,
    status: "passed",
  }));
}

async function populateProvider(provider: DeterministicStorageProvider) {
  const sessions = await prisma.uploadSession.findMany({
    where: { id: { in: Object.values(ids.sessions) } },
    select: { objectKey: true },
  });
  for (const session of sessions) {
    provider.putObject({
      bytes: STORAGE_MEDIA_GATE6B_SOURCE_BYTES,
      contentType: "image/png",
      objectKey: session.objectKey,
    });
  }
}

async function resetFixtureJobs() {
  await prisma.storedAsset.updateMany({
    where: { id: { in: Object.values(ids.assets) } },
    data: {
      rescanClaimExpiresAt: null,
      rescanClaimFencingToken: null,
      rescanClaimJobId: null,
      rescanClaimLeaseToken: null,
    },
  });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "MediaRendition"
    SET "state" = CASE WHEN "state" = 'PROCESSING' THEN 'PENDING'::"MediaRenditionState" ELSE "state" END,
        "claimExpiresAt" = NULL,
        "claimFencingToken" = NULL,
        "claimJobId" = NULL,
        "claimLeaseToken" = NULL
    WHERE "sourceAssetId" IN (${Prisma.join(Object.values(ids.assets).map((id) => Prisma.sql`${id}::uuid`))})
  `);
  await prisma.platformJobMutation.deleteMany({ where: { actorAdminUserId: ids.adminUserId } });
  await prisma.platformJobAttempt.deleteMany({ where: { job: { createdByAdminUserId: ids.adminUserId } } });
  await prisma.platformJob.deleteMany({ where: { createdByAdminUserId: ids.adminUserId, parentJobId: { not: null } } });
  await prisma.platformJob.deleteMany({ where: { createdByAdminUserId: ids.adminUserId } });
}

async function clearQueuedFixtureJobs() {
  await prisma.platformJobAttempt.deleteMany({
    where: { job: { createdByAdminUserId: ids.adminUserId, status: { in: ["AVAILABLE", "SCHEDULED", "RETRY_WAIT"] } } },
  });
  await prisma.platformJob.deleteMany({
    where: { createdByAdminUserId: ids.adminUserId, parentJobId: { not: null }, status: { in: ["AVAILABLE", "SCHEDULED", "RETRY_WAIT"] } },
  });
  await prisma.platformJob.deleteMany({
    where: { createdByAdminUserId: ids.adminUserId, status: { in: ["AVAILABLE", "SCHEDULED", "RETRY_WAIT"] } },
  });
}

async function prepareRunningJob(jobType: PlatformJobType, payload: unknown) {
  const jobId = await runPlatformJobSerializable(async (transaction) => {
    const created = await enqueuePlatformJob(transaction, {
      availableAt: new Date("2000-01-01T00:00:00Z"),
      createdByAdminUserId: ids.adminUserId,
      createdByPersonId: ids.adminPersonId,
      deduplicationKey: `staging:${STORAGE_MEDIA_GATE6B_MARKER}:smoke:${jobType.toLowerCase()}:${randomUUID()}`,
      jobType,
      maxAttempts: 2,
      payload,
      payloadVersion: 1,
      priority: 9,
      source: "ADMIN_MANUAL",
    });
    return created.job.id;
  });
  return claimExistingJob(jobId);
}

async function enqueueSmokeJob(jobType: PlatformJobType, payload: unknown) {
  return enqueueSmokeJobForActor(ids.adminUserId, ids.adminPersonId, jobType, payload);
}

async function enqueueSmokeJobForActor(
  userId: string,
  personId: string,
  jobType: PlatformJobType,
  payload: unknown,
) {
  return (await runPlatformJobSerializable((transaction) => enqueuePlatformJob(transaction, {
    availableAt: new Date("2000-01-01T00:00:00Z"),
    createdByAdminUserId: userId,
    createdByPersonId: personId,
    deduplicationKey: `staging:${STORAGE_MEDIA_GATE6B_MARKER}:${jobType.toLowerCase()}:${randomUUID()}`,
    jobType,
    maxAttempts: 2,
    payload,
    payloadVersion: 1,
    priority: 9,
    source: "ADMIN_MANUAL",
  }))).job;
}

async function setFixturePermissions(permissions: string[]) {
  await prisma.adminAccess.update({
    where: { id: ids.adminAccessId },
    data: { permissions },
  });
}

async function claimExistingJob(jobId: string) {
  await prisma.platformJob.updateMany({
    where: {
      createdByAdminUserId: ids.adminUserId,
      id: { not: jobId },
      status: { in: ["AVAILABLE", "SCHEDULED", "RETRY_WAIT"] },
    },
    data: { availableAt: new Date("2100-01-01T00:00:00Z") },
  });
  await prisma.platformJob.update({ where: { id: jobId }, data: { availableAt: new Date("2000-01-01T00:00:00Z") } });
  const operation = await runPlatformJobSerializable(async (transaction) => {
    const idempotencyKey = randomUUID();
    const workerId = `operation:${platformJobHash(idempotencyKey)}`;
    const leaseToken = randomUUID();
    const mutation = await transaction.platformJobMutation.create({
      data: {
        action: "WORKER_BATCH",
        actorAdminUserId: ids.adminUserId,
        actorPersonId: ids.adminPersonId,
        idempotencyKey,
        operationBatchSize: 1,
        operationFencingToken: BigInt(1),
        operationLeaseExpiresAt: new Date(Date.now() + 5 * 60_000),
        operationLeaseToken: leaseToken,
        operationWorkerId: workerId,
        requestHash: platformJobHash({ action: "WORKER_BATCH", batchSize: 1 }),
        result: { state: "PROCESSING" },
      },
    });
    const authority: PlatformJobOperationAuthority = {
      fencingToken: BigInt(1),
      leaseToken,
      mutationId: mutation.id,
      workerId,
    };
    const [claim] = await claimPlatformJobsInTransaction(transaction, {
      batchSize: 1,
      operation: authority,
      workerId,
    });
    return { authority, claim };
  });
  const { authority, claim } = operation;
  assert.equal(claim?.id, jobId);
  await startPlatformJob({
    fencingToken: claim!.fencingToken,
    jobId: claim!.id,
    leaseToken: claim!.leaseToken,
    operation: authority,
    workerId: authority.workerId,
  });
  return { claim: claim!, operation: authority, workerId: authority.workerId };
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

function proxyProvider(
  provider: DeterministicStorageProvider,
  deleteObject = provider.deleteObject.bind(provider),
) {
  return {
    kind: provider.kind,
    createDownloadTarget: provider.createDownloadTarget.bind(provider),
    createUploadTarget: provider.createUploadTarget.bind(provider),
    deleteObject,
    getObjectForInspection: provider.getObjectForInspection.bind(provider),
    headObject: provider.headObject.bind(provider),
    writeObject: provider.writeObject.bind(provider),
  };
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    const safeError = error && typeof error === "object"
      ? {
          code: "code" in error && typeof error.code === "string" ? error.code : null,
          name: "name" in error && typeof error.name === "string" ? error.name : "Error",
        }
      : { code: null, name: "Error" };
    console.error(`Gate 6B staging smoke failed closed at ${smokePhase}: ${JSON.stringify({ diagnostic: smokeDiagnostic, error: safeError })}.`);
  })
  .finally(async () => {
    setStorageMalwareScannerForTests(undefined);
    setStorageProviderForTests(undefined);
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
