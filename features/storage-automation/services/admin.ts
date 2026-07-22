import "server-only";

import { Prisma, type PlatformJobType } from "@prisma/client";

import { MEDIA_RENDITION_PROFILES } from "@/features/media/domain/rendition-registry";
import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import {
  PLATFORM_JOB_DISCOVERY_TYPES,
  STAGE_6_ARCHITECTURE,
} from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  assertPlatformJobAdminCurrent,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import { enqueuePlatformJob } from "@/features/platform-jobs/services/jobs";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import { configuredStorageProvider } from "@/features/storage/providers/registry";
import {
  assertStorageAdminCurrent,
  type StorageAdminActor,
} from "@/features/storage/services/actor";

export async function storageAutomationStatus(
  context: PlatformJobAdminContext,
  storageActor: StorageAdminActor,
) {
  return runPlatformJobSerializable(async (transaction) => {
    await assertCombinedAuthority(transaction, context, storageActor);
    return {
      type: "STORAGE_MEDIA_AUTOMATION_STATUS" as const,
      gate: "6B",
      state: "ACTIVE",
      jobTypes: [
        "STORAGE_MAINTENANCE_DISCOVERY",
        "STORAGE_ORPHAN_CLEANUP",
        "STORAGE_ASSET_DELETE_RETRY",
        "STORAGE_RESCAN_DISCOVERY",
        "STORAGE_ASSET_RESCAN",
        "MEDIA_RENDITION_DISCOVERY",
        "MEDIA_RENDITION_GENERATE",
        "MEDIA_RENDITION_CLEANUP_DISCOVERY",
        "MEDIA_RENDITION_DELETE",
      ],
      scheduleKeys: [...PLATFORM_JOB_DISCOVERY_TYPES],
      renditionProfiles: Object.keys(MEDIA_RENDITION_PROFILES),
      provider: configuredStorageProvider().kind,
      scanner: "SCANNER_NOT_CONFIGURED",
      runtime: STAGE_6_ARCHITECTURE.runtime,
    };
  });
}

export async function triggerStorageAutomationDiscovery(
  context: PlatformJobAdminContext,
  storageActor: StorageAdminActor,
  input: {
    batchSize: number;
    idempotencyKey: string;
    jobType: (typeof PLATFORM_JOB_DISCOVERY_TYPES)[number];
  },
) {
  if (!PLATFORM_JOB_DISCOVERY_TYPES.includes(input.jobType)) {
    platformJobError("VALIDATION_ERROR", "The storage-automation discovery type is not allow-listed.");
  }
  return enqueueManualAutomation(context, storageActor, {
    idempotencyKey: input.idempotencyKey,
    jobType: input.jobType,
    payload: { batchSize: input.batchSize },
    request: { action: "GATE6B_DISCOVERY", batchSize: input.batchSize, jobType: input.jobType },
  });
}

export async function requestStoredAssetRescan(
  context: PlatformJobAdminContext,
  storageActor: StorageAdminActor,
  input: { assetId: string; expectedVersion: number; idempotencyKey: string },
) {
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertCombinedAuthority(transaction, context, storageActor);
    const requestHash = platformJobHash({ action: "GATE6B_EXACT_RESCAN", ...input });
    const replay = await mutationReplay(transaction, current.userId, input.idempotencyKey, requestHash);
    if (replay) return { ...replay, replay: true as const };
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "StoredAsset" WHERE "id" = ${input.assetId}::uuid FOR SHARE`,
    );
    const asset = await transaction.storedAsset.findUnique({ where: { id: input.assetId } });
    if (!asset) platformJobError("NOT_FOUND", "The stored asset was not found.");
    if (asset.version !== input.expectedVersion) platformJobError("CONFLICT", "The stored asset version changed.");
    if (!asset || !["READY", "QUARANTINED"].includes(asset.state)) {
      platformJobError("CONFLICT", "The stored asset is not eligible for explicit rescan.");
    }
    const created = await enqueuePlatformJob(transaction, {
      availableAt: asset.updatedAt,
      createdByAdminUserId: current.userId,
      createdByPersonId: current.personId,
      deduplicationKey: `gate6b:manual-rescan:${asset.id}:v${asset.version}:${input.idempotencyKey}`,
      jobType: "STORAGE_ASSET_RESCAN",
      maxAttempts: 5,
      payload: { assetId: asset.id, expectedVersion: asset.version },
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    });
    const result = { jobId: created.job.id, jobType: created.job.jobType, status: created.job.status, version: created.job.version };
    await transaction.platformJobMutation.create({
      data: {
        action: "MANUAL_TRIGGER",
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        jobId: created.job.id,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function enqueueManualAutomation(
  context: PlatformJobAdminContext,
  storageActor: StorageAdminActor,
  input: {
    idempotencyKey: string;
    jobType: PlatformJobType;
    payload: unknown;
    request: unknown;
  },
) {
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertCombinedAuthority(transaction, context, storageActor);
    const requestHash = platformJobHash(input.request);
    const replay = await mutationReplay(transaction, current.userId, input.idempotencyKey, requestHash);
    if (replay) return { ...replay, replay: true as const };
    const now = new Date();
    const created = await enqueuePlatformJob(transaction, {
      availableAt: now,
      createdByAdminUserId: current.userId,
      createdByPersonId: current.personId,
      deduplicationKey: `gate6b:manual:${input.jobType}:${input.idempotencyKey}`,
      jobType: input.jobType,
      maxAttempts: 5,
      payload: input.payload,
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    });
    const result = { jobId: created.job.id, jobType: created.job.jobType, status: created.job.status, version: created.job.version };
    await transaction.platformJobMutation.create({
      data: {
        action: "MANUAL_TRIGGER",
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        jobId: created.job.id,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function assertCombinedAuthority(
  transaction: Prisma.TransactionClient,
  context: PlatformJobAdminContext,
  storageActor: StorageAdminActor,
) {
  const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
  await assertStorageAdminCurrent(transaction, storageActor, "STORAGE_RECORDS_MANAGE");
  return current;
}

async function mutationReplay(
  transaction: Prisma.TransactionClient,
  userId: string,
  idempotencyKey: string,
  requestHash: string,
) {
  const existing = await transaction.platformJobMutation.findUnique({
    where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: userId, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.action !== "MANUAL_TRIGGER" || existing.requestHash !== requestHash) {
    platformJobError("IDEMPOTENCY_CONFLICT", "The Admin idempotency key was reused with changed input.");
  }
  if (!existing.result || typeof existing.result !== "object" || Array.isArray(existing.result)) {
    platformJobError("CONFLICT", "The stored storage-automation result is invalid.");
  }
  return existing.result as Record<string, string | number | boolean | null>;
}
