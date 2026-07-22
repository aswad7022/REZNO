import "server-only";

import {
  Prisma,
  type MediaRenditionProfile,
  type PlatformJobErrorCode,
  type PlatformJobType,
  type StoredAsset,
  type StorageProviderKind,
} from "@prisma/client";

import {
  generateMediaRenditionObjectKey,
  mediaRenditionProfileForSlot,
  mediaRenditionSourceFingerprint,
} from "@/features/media/domain/rendition-registry";
import { renderMediaRendition } from "@/features/media/services/rendition-processor";
import type {
  PlatformJobHandlerContext,
  PlatformJobHandlerResult,
} from "@/features/platform-jobs/services/handlers";
import { enqueuePlatformJob } from "@/features/platform-jobs/services/jobs";
import {
  STORAGE_INSPECTION_POLICY_VERSION,
  STORAGE_ORPHAN_RETENTION_MS,
  STORAGE_PROVIDER_CLAIM_TTL_MS,
  sha256Hex,
} from "@/features/storage/domain/policy";
import { storagePurposePolicy } from "@/features/storage/domain/purpose-registry";
import { inspectStaticRaster } from "@/features/storage/inspection/image-inspector";
import { configuredStorageProvider } from "@/features/storage/providers/registry";
import {
  callStorageProvider,
  type ObjectMetadataResult,
  type StorageProvider,
  type StorageProviderOutcome,
} from "@/features/storage/providers/provider";
import { configuredStorageMalwareScanner } from "@/features/storage/services/storage-mutations";
import {
  isMediaRenditionSourceEligible,
  isOrphanCleanupEligible,
  isStoredAssetRescanEligible,
} from "@/features/storage-automation/domain/policy";
import { prisma } from "@/lib/db/prisma";

type JobContext = PlatformJobHandlerContext;
type DiscoveryPayload = { batchSize: number };
type ExactAssetPayload = { assetId: string; expectedVersion: number };
type ExactSessionPayload = { expectedVersion: number; uploadSessionId: string };
type RenditionGeneratePayload = ExactAssetPayload & { profile: MediaRenditionProfile };
type RenditionDeletePayload = { expectedVersion: number; renditionId: string };
type AutomationErrorTestHook = (error: unknown) => void;
let automationErrorTestHook: AutomationErrorTestHook | undefined;

export function setStorageAutomationErrorTestHook(hook: AutomationErrorTestHook | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Storage automation error test hooks are unavailable in production.");
  }
  automationErrorTestHook = hook;
}

export async function runStorageMediaAutomationHandler(
  jobType: Exclude<PlatformJobType, "PLATFORM_HEALTH_PROBE">,
  payload: unknown,
  context: JobContext,
): Promise<PlatformJobHandlerResult> {
  try {
    switch (jobType) {
      case "STORAGE_MAINTENANCE_DISCOVERY":
        return success(await discoverStorageMaintenance(payload as DiscoveryPayload, context));
      case "STORAGE_ORPHAN_CLEANUP":
        return success(await cleanupOrphanSession(payload as ExactSessionPayload, context));
      case "STORAGE_ASSET_DELETE_RETRY":
        return success(await retryDeletePendingAsset(payload as ExactAssetPayload, context));
      case "STORAGE_RESCAN_DISCOVERY":
        return success(await discoverStorageRescans(payload as DiscoveryPayload, context));
      case "STORAGE_ASSET_RESCAN":
        return success(await rescanStoredAsset(payload as ExactAssetPayload, context));
      case "MEDIA_RENDITION_DISCOVERY":
        return success(await discoverMediaRenditions(payload as DiscoveryPayload, context));
      case "MEDIA_RENDITION_GENERATE":
        return success(await generateMediaRendition(payload as RenditionGeneratePayload, context));
      case "MEDIA_RENDITION_CLEANUP_DISCOVERY":
        return success(await discoverRenditionCleanup(payload as DiscoveryPayload, context));
      case "MEDIA_RENDITION_DELETE":
        return success(await deleteMediaRendition(payload as RenditionDeletePayload, context));
    }
  } catch (error) {
    automationErrorTestHook?.(error);
    if (error instanceof AutomationFailure) {
      return { errorCode: error.errorCode, outcome: "FAILED", retryable: error.retryable };
    }
    return { errorCode: "HANDLER_EXCEPTION", outcome: "FAILED", retryable: true };
  }
}

async function discoverStorageMaintenance(payload: DiscoveryPayload, context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const retentionBoundary = new Date(now.getTime() - STORAGE_ORPHAN_RETENTION_MS);
    const staleClaimBoundary = new Date(now.getTime() - STORAGE_PROVIDER_CLAIM_TTL_MS);
    const expired = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidates AS (
        SELECT session."id"
        FROM "UploadSession" AS session
        WHERE session."state" IN ('CREATED', 'TARGET_ISSUED', 'UPLOADED')
          AND session."expiresAt" <= ${now}
        ORDER BY session."expiresAt", session."id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${payload.batchSize}
      )
      UPDATE "UploadSession" AS session
      SET "state" = 'EXPIRED', "failureCode" = 'SESSION_EXPIRED',
          "version" = session."version" + 1, "updatedAt" = ${now}
      FROM candidates
      WHERE session."id" = candidates."id"
        AND session."state" IN ('CREATED', 'TARGET_ISSUED', 'UPLOADED')
      RETURNING session."id"
    `);
    const orphanSessions = await transaction.$queryRaw<Array<{
      expiresAt: Date;
      id: string;
      version: number;
    }>>(Prisma.sql`
      SELECT session."id", session."version", session."expiresAt"
      FROM "UploadSession" AS session
      WHERE session."state" = 'EXPIRED'
        AND session."expiresAt" <= ${retentionBoundary}
        AND session."provider" <> 'NOT_CONFIGURED'
        AND COALESCE(session."failureCode", '') <> 'ORPHAN_OBJECT_DELETED'
        AND NOT EXISTS (SELECT 1 FROM "StoredAsset" AS asset WHERE asset."uploadSessionId" = session."id")
        AND (session."providerCleanupClaimId" IS NULL OR session."providerCleanupClaimedAt" <= ${staleClaimBoundary})
      ORDER BY session."expiresAt", session."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    const deletePending = await transaction.$queryRaw<Array<{
      deleteRequestedAt: Date;
      id: string;
      version: number;
    }>>(Prisma.sql`
      SELECT asset."id", asset."version", asset."deleteRequestedAt"
      FROM "StoredAsset" AS asset
      WHERE asset."state" = 'DELETE_PENDING'
        AND (asset."providerCleanupClaimId" IS NULL OR asset."providerCleanupClaimedAt" <= ${staleClaimBoundary})
        AND NOT EXISTS (
          SELECT 1 FROM "MediaBinding" AS binding
          WHERE binding."assetId" = asset."id" AND binding."state" = 'ACTIVE'
        )
      ORDER BY asset."deleteRequestedAt", asset."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    let enqueued = 0;
    let skipped = 0;
    for (const session of orphanSessions) {
      const created = await enqueueChild(transaction, job, context.jobId, {
        availableAt: new Date(session.expiresAt.getTime() + STORAGE_ORPHAN_RETENTION_MS),
        deduplicationKey: `gate6b:orphan:${session.id}:v${session.version}`,
        jobType: "STORAGE_ORPHAN_CLEANUP",
        payload: { expectedVersion: session.version, uploadSessionId: session.id },
      });
      if (created) enqueued += 1;
      else skipped += 1;
    }
    for (const asset of deletePending) {
      const created = await enqueueChild(transaction, job, context.jobId, {
        availableAt: asset.deleteRequestedAt,
        deduplicationKey: `gate6b:asset-delete:${asset.id}:v${asset.version}`,
        jobType: "STORAGE_ASSET_DELETE_RETRY",
        payload: { assetId: asset.id, expectedVersion: asset.version },
      });
      if (created) enqueued += 1;
      else skipped += 1;
    }
    return {
      enqueued,
      kind: "STORAGE_MAINTENANCE_DISCOVERED" as const,
      scanned: expired.length + orphanSessions.length + deletePending.length,
      skipped,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function discoverStorageRescans(payload: DiscoveryPayload, context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const assets = await transaction.$queryRaw<Array<{ id: string; updatedAt: Date; version: number }>>(Prisma.sql`
      SELECT asset."id", asset."version", asset."updatedAt"
      FROM "StoredAsset" AS asset
      WHERE asset."state" = 'QUARANTINED'
        AND asset."inspectionPolicyVersion" IS DISTINCT FROM ${STORAGE_INSPECTION_POLICY_VERSION}
        AND (asset."rescanClaimJobId" IS NULL OR asset."rescanClaimExpiresAt" <= ${now})
      ORDER BY asset."updatedAt", asset."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    let enqueued = 0;
    let skipped = 0;
    for (const asset of assets) {
      const created = await enqueueChild(transaction, job, context.jobId, {
        availableAt: asset.updatedAt,
        deduplicationKey: `gate6b:rescan:${asset.id}:v${asset.version}`,
        jobType: "STORAGE_ASSET_RESCAN",
        payload: { assetId: asset.id, expectedVersion: asset.version },
      });
      if (created) enqueued += 1;
      else skipped += 1;
    }
    return { enqueued, kind: "STORAGE_RESCAN_DISCOVERED" as const, scanned: assets.length, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function discoverMediaRenditions(payload: DiscoveryPayload, context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { job } = await assertJobLease(transaction, context);
    const candidates = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT asset."id"
      FROM "StoredAsset" AS asset
      WHERE asset."state" = 'READY'
        AND EXISTS (
          SELECT 1 FROM "MediaBinding" AS binding
          WHERE binding."assetId" = asset."id" AND binding."state" = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1
              FROM "MediaRendition" AS rendition
              WHERE rendition."sourceAssetId" = asset."id"
                AND rendition."sourceAssetVersion" = asset."version"
                AND rendition."profile" = (
                  CASE
                    WHEN binding."slot" = 'CUSTOMER_AVATAR' THEN 'AVATAR_256_WEBP'
                    WHEN binding."slot" IN ('BUSINESS_LOGO', 'SERVICE_PRIMARY', 'STORE_LOGO', 'MENU_ITEM_PRIMARY') THEN 'CARD_640_WEBP'
                    ELSE 'HERO_1600_WEBP'
                  END
                )::"MediaRenditionProfile"
            )
        )
      ORDER BY asset."updatedAt", asset."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    const assets = await transaction.storedAsset.findMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) }, state: "READY" },
      include: { mediaBindings: { where: { state: "ACTIVE" }, orderBy: { id: "asc" } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    });
    let enqueued = 0;
    let skipped = 0;
    for (const asset of assets) {
      const profiles = [...new Set(asset.mediaBindings.map((binding) => mediaRenditionProfileForSlot(binding.slot)))];
      if (profiles.length === 0) { skipped += 1; continue; }
      for (const profile of profiles) {
        const existing = await transaction.mediaRendition.findUnique({
          where: {
            sourceAssetId_sourceAssetVersion_profile: {
              profile,
              sourceAssetId: asset.id,
              sourceAssetVersion: asset.version,
            },
          },
          select: { id: true },
        });
        if (existing) { skipped += 1; continue; }
        const created = await enqueueChild(transaction, job, context.jobId, {
          availableAt: asset.updatedAt,
          deduplicationKey: `gate6b:rendition:${asset.id}:v${asset.version}:${profile}`,
          jobType: "MEDIA_RENDITION_GENERATE",
          payload: { assetId: asset.id, expectedVersion: asset.version, profile },
        });
        if (created) enqueued += 1;
        else skipped += 1;
      }
    }
    return { enqueued, kind: "MEDIA_RENDITION_DISCOVERED" as const, scanned: assets.length, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function discoverRenditionCleanup(payload: DiscoveryPayload, context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const readyCandidates = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT rendition."id"
      FROM "MediaRendition" AS rendition
      JOIN "StoredAsset" AS asset ON asset."id" = rendition."sourceAssetId"
      WHERE rendition."state" = 'READY'
        AND (
          asset."state" <> 'READY'
          OR asset."version" <> rendition."sourceAssetVersion"
          OR NOT EXISTS (
            SELECT 1
            FROM "MediaBinding" AS binding
            WHERE binding."assetId" = asset."id"
              AND binding."state" = 'ACTIVE'
              AND rendition."profile" = (
                CASE
                  WHEN binding."slot" = 'CUSTOMER_AVATAR' THEN 'AVATAR_256_WEBP'
                  WHEN binding."slot" IN ('BUSINESS_LOGO', 'SERVICE_PRIMARY', 'STORE_LOGO', 'MENU_ITEM_PRIMARY') THEN 'CARD_640_WEBP'
                  ELSE 'HERO_1600_WEBP'
                END
              )::"MediaRenditionProfile"
          )
        )
      ORDER BY rendition."updatedAt", rendition."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    const ready = await transaction.mediaRendition.findMany({
      where: { id: { in: readyCandidates.map((candidate) => candidate.id) }, state: "READY" },
      include: {
        sourceAsset: {
          include: { mediaBindings: { where: { state: "ACTIVE" }, orderBy: { id: "asc" } } },
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    });
    let superseded = 0;
    for (const rendition of ready) {
      const legal = isMediaRenditionSourceEligible({
        activeSlots: rendition.sourceAsset.mediaBindings.map((binding) => binding.slot),
        profile: rendition.profile,
        sourceAssetVersion: rendition.sourceAssetVersion,
        sourceState: rendition.sourceAsset.state,
        sourceVersion: rendition.sourceAsset.version,
      });
      if (legal) continue;
      const changed = await transaction.mediaRendition.updateMany({
        where: { id: rendition.id, state: "READY", version: rendition.version },
        data: { state: "SUPERSEDED", updatedAt: now, version: { increment: 1 } },
      });
      superseded += changed.count;
    }
    const deleteCandidates = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT rendition."id"
      FROM "MediaRendition" AS rendition
      WHERE rendition."state" IN ('FAILED', 'SUPERSEDED', 'DELETE_PENDING')
        AND (rendition."claimJobId" IS NULL OR rendition."claimExpiresAt" <= ${now})
      ORDER BY rendition."updatedAt", rendition."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    const candidates = await transaction.mediaRendition.findMany({
      where: {
        id: { in: deleteCandidates.map((candidate) => candidate.id) },
        state: { in: ["FAILED", "SUPERSEDED", "DELETE_PENDING"] },
        OR: [{ claimJobId: null }, { claimExpiresAt: { lte: now } }],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    });
    let enqueued = 0;
    let skipped = 0;
    for (const rendition of candidates) {
      const created = await enqueueChild(transaction, job, context.jobId, {
        availableAt: rendition.updatedAt,
        deduplicationKey: `gate6b:rendition-delete:${rendition.id}:v${rendition.version}`,
        jobType: "MEDIA_RENDITION_DELETE",
        payload: { expectedVersion: rendition.version, renditionId: rendition.id },
      });
      if (created) enqueued += 1;
      else skipped += 1;
    }
    return {
      enqueued,
      kind: "MEDIA_RENDITION_CLEANUP_DISCOVERED" as const,
      scanned: ready.length + candidates.length,
      skipped: skipped + Math.max(0, ready.length - superseded),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function cleanupOrphanSession(payload: ExactSessionPayload, context: JobContext) {
  const prepared = await prisma.$transaction(async (transaction) => {
    const { now } = await assertJobLease(transaction, context);
    const session = await transaction.uploadSession.findUnique({
      where: { id: payload.uploadSessionId }, include: { asset: { select: { id: true } } },
    });
    if (!session) return { terminal: exact("STORAGE_ORPHAN_CLEANED", "ABSENT", "ABSENT") };
    if (session.version !== payload.expectedVersion
      || !isOrphanCleanupEligible({
        expiresAt: session.expiresAt,
        failureCode: session.failureCode,
        hasStoredAsset: Boolean(session.asset),
        now,
        provider: session.provider,
        state: session.state,
      })) {
      return { terminal: exact("STORAGE_ORPHAN_CLEANED", "STALE", session.state) };
    }
    assertClaimAvailable(session.providerCleanupClaimId, session.providerCleanupClaimedAt, now);
    const changed = await transaction.uploadSession.updateMany({
      where: { id: session.id, state: "EXPIRED", version: payload.expectedVersion },
      data: { providerCleanupClaimId: context.leaseToken, providerCleanupClaimedAt: now },
    });
    if (changed.count !== 1) return { terminal: exact("STORAGE_ORPHAN_CLEANED", "STALE", "EXPIRED") };
    return { session, terminal: null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (prepared.terminal) return prepared.terminal;
  const session = prepared.session!;
  try {
    assertSignal(context);
    const provider = providerFor(session.provider);
    const outcome = await callStorageProvider(() => provider.deleteObject({ objectKey: session.objectKey, provider: session.provider }));
    assertSignal(context);
    if (outcome.outcome !== "READY" && outcome.outcome !== "NOT_FOUND") providerOutcomeFailure(outcome.outcome);
    return await prisma.$transaction(async (transaction) => {
      const { now } = await assertJobLease(transaction, context);
      const changed = await transaction.uploadSession.updateMany({
        where: {
          id: session.id,
          providerCleanupClaimId: context.leaseToken,
          state: "EXPIRED",
          version: payload.expectedVersion,
        },
        data: {
          failureCode: "ORPHAN_OBJECT_DELETED",
          providerCleanupClaimId: null,
          providerCleanupClaimedAt: null,
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) automationFailure("PERMANENT_FAILURE", false, "STALE_ORPHAN_CLAIM");
      return exact("STORAGE_ORPHAN_CLEANED", outcome.outcome === "NOT_FOUND" ? "ABSENT" : "COMPLETED", "EXPIRED");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await releaseSessionCleanupClaim(session.id, payload.expectedVersion, context.leaseToken);
    throw error;
  }
}

async function retryDeletePendingAsset(payload: ExactAssetPayload, context: JobContext) {
  const prepared = await prisma.$transaction(async (transaction) => {
    const { now } = await assertJobLease(transaction, context);
    const asset = await transaction.storedAsset.findUnique({ where: { id: payload.assetId } });
    if (!asset) return { terminal: exact("STORAGE_ASSET_DELETE_RETRIED", "ABSENT", "ABSENT") };
    if (asset.version !== payload.expectedVersion || asset.state !== "DELETE_PENDING") {
      return { terminal: exact("STORAGE_ASSET_DELETE_RETRIED", "STALE", asset.state) };
    }
    const binding = await transaction.mediaBinding.findFirst({ where: { assetId: asset.id, state: "ACTIVE" }, select: { id: true } });
    if (binding) return { terminal: exact("STORAGE_ASSET_DELETE_RETRIED", "STALE", "ACTIVE_BINDING") };
    assertClaimAvailable(asset.providerCleanupClaimId, asset.providerCleanupClaimedAt, now);
    const changed = await transaction.storedAsset.updateMany({
      where: { id: asset.id, state: "DELETE_PENDING", version: payload.expectedVersion },
      data: { providerCleanupClaimId: context.leaseToken, providerCleanupClaimedAt: now },
    });
    if (changed.count !== 1) return { terminal: exact("STORAGE_ASSET_DELETE_RETRIED", "STALE", "DELETE_PENDING") };
    return { asset, terminal: null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (prepared.terminal) return prepared.terminal;
  const asset = prepared.asset!;
  try {
    assertSignal(context);
    const provider = providerFor(asset.provider);
    const outcome = await callStorageProvider(() => provider.deleteObject({ objectKey: asset.objectKey, provider: asset.provider }));
    assertSignal(context);
    if (outcome.outcome !== "READY" && outcome.outcome !== "NOT_FOUND") providerOutcomeFailure(outcome.outcome);
    return await prisma.$transaction(async (transaction) => {
      const { now } = await assertJobLease(transaction, context);
      const binding = await transaction.mediaBinding.findFirst({ where: { assetId: asset.id, state: "ACTIVE" }, select: { id: true } });
      if (binding) automationFailure("PERMANENT_FAILURE", false, "ACTIVE_BINDING");
      const changed = await transaction.storedAsset.updateMany({
        where: {
          id: asset.id,
          providerCleanupClaimId: context.leaseToken,
          state: "DELETE_PENDING",
          version: payload.expectedVersion,
        },
        data: {
          deletedAt: now,
          providerCleanupClaimId: null,
          providerCleanupClaimedAt: null,
          state: "DELETED",
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) automationFailure("PERMANENT_FAILURE", false, "STALE_ASSET_DELETE_CLAIM");
      return exact("STORAGE_ASSET_DELETE_RETRIED", outcome.outcome === "NOT_FOUND" ? "ABSENT" : "COMPLETED", "DELETED");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await releaseAssetCleanupClaim(asset.id, payload.expectedVersion, context.leaseToken);
    throw error;
  }
}

async function rescanStoredAsset(payload: ExactAssetPayload, context: JobContext) {
  const prepared = await prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const asset = await transaction.storedAsset.findUnique({ where: { id: payload.assetId } });
    if (!asset) return { terminal: exact("STORAGE_ASSET_RESCANNED", "ABSENT", "ABSENT") };
    if (asset.version !== payload.expectedVersion || !isStoredAssetRescanEligible({
      inspectionPolicyVersion: asset.inspectionPolicyVersion,
      source: job.source,
      state: asset.state,
    })) {
      return { terminal: exact("STORAGE_ASSET_RESCANNED", "STALE", asset.state) };
    }
    assertRescanClaimAvailable(asset, now);
    const changed = await transaction.storedAsset.updateMany({
      where: { id: asset.id, state: asset.state, version: payload.expectedVersion },
      data: {
        rescanClaimExpiresAt: job.leaseExpiresAt,
        rescanClaimFencingToken: context.fencingToken,
        rescanClaimJobId: context.jobId,
        rescanClaimLeaseToken: context.leaseToken,
      },
    });
    if (changed.count !== 1) return { terminal: exact("STORAGE_ASSET_RESCANNED", "STALE", asset.state) };
    return { asset, terminal: null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (prepared.terminal) return prepared.terminal;
  const asset = prepared.asset!;
  try {
    assertSignal(context);
    const inspected = await inspectExactAsset(asset);
    assertSignal(context);
    if (inspected.kind === "UNSAFE") {
      return await applyRescanOutcome(asset, payload.expectedVersion, context, {
        failureCode: inspected.failureCode,
        inspection: inspected.inspection,
        scannerOutcome: inspected.scannerOutcome,
        state: "REJECTED",
      });
    }
    if (inspected.scannerOutcome === "SCAN_FAILED") {
      automationFailure("TRANSIENT_FAILURE", true, "SCANNER_FAILURE");
    }
    const state = inspected.scannerOutcome === "MALWARE_DETECTED" ? "REJECTED" : "READY";
    return await applyRescanOutcome(asset, payload.expectedVersion, context, {
      failureCode: state === "REJECTED" ? "MALWARE_DETECTED" : null,
      inspection: inspected.inspection,
      scannerOutcome: inspected.scannerOutcome,
      state,
    });
  } catch (error) {
    await releaseRescanClaim(asset.id, payload.expectedVersion, context);
    throw error;
  }
}

async function generateMediaRendition(payload: RenditionGeneratePayload, context: JobContext) {
  const prepared = await prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const asset = await transaction.storedAsset.findUnique({
      where: { id: payload.assetId },
      include: { mediaBindings: { where: { state: "ACTIVE" }, orderBy: { id: "asc" } } },
    });
    if (!asset || asset.state !== "READY" || asset.version !== payload.expectedVersion) {
      automationFailure("PERMANENT_FAILURE", false, "STALE_RENDITION_SOURCE");
    }
    if (!isMediaRenditionSourceEligible({
      activeSlots: asset.mediaBindings.map((binding) => binding.slot),
      profile: payload.profile,
      sourceAssetVersion: asset.version,
      sourceState: asset.state,
      sourceVersion: asset.version,
    })) {
      automationFailure("PERMANENT_FAILURE", false, "RENDITION_PROFILE_MISMATCH");
    }
    const sourceFingerprint = mediaRenditionSourceFingerprint({
      profile: payload.profile,
      sourceAssetId: asset.id,
      sourceAssetVersion: asset.version,
      sourceChecksumSha256: asset.checksumSha256,
      sourceProviderObjectVersion: asset.providerObjectVersion,
    });
    const objectKey = generateMediaRenditionObjectKey(asset.id, sourceFingerprint);
    let rendition = await transaction.mediaRendition.findUnique({
      where: { sourceAssetId_sourceAssetVersion_profile: {
        profile: payload.profile, sourceAssetId: asset.id, sourceAssetVersion: asset.version,
      } },
    });
    if (rendition?.state === "READY") {
      return { asset, replay: rendition, rendition: null };
    }
    if (rendition && (rendition.sourceFingerprint !== sourceFingerprint || rendition.objectKey !== objectKey)) {
      automationFailure("PERMANENT_FAILURE", false, "RENDITION_IDENTITY_CONFLICT");
    }
    if (rendition?.claimJobId && rendition.claimExpiresAt && rendition.claimExpiresAt > now) {
      automationFailure("TRANSIENT_FAILURE", true, "RENDITION_CLAIM_BUSY");
    }
    rendition = rendition
      ? await transaction.mediaRendition.update({
          where: { id: rendition.id },
          data: {
            claimExpiresAt: job.leaseExpiresAt,
            claimFencingToken: context.fencingToken,
            claimJobId: context.jobId,
            claimLeaseToken: context.leaseToken,
            failureCode: null,
            state: "PROCESSING",
            version: { increment: 1 },
          },
        })
      : await transaction.mediaRendition.create({
          data: {
            claimExpiresAt: job.leaseExpiresAt,
            claimFencingToken: context.fencingToken,
            claimJobId: context.jobId,
            claimLeaseToken: context.leaseToken,
            objectKey,
            profile: payload.profile,
            provider: asset.provider,
            sourceAssetId: asset.id,
            sourceAssetVersion: asset.version,
            sourceChecksumSha256: asset.checksumSha256,
            sourceFingerprint,
            sourceProviderObjectVersion: asset.providerObjectVersion,
            state: "PROCESSING",
          },
        });
    return { asset, rendition, replay: null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (prepared.replay) return renditionMetadata(prepared.replay);
  const asset = prepared.asset;
  const rendition = prepared.rendition!;
  try {
    assertSignal(context);
    const inspected = await inspectExactAsset(asset);
    if (inspected.kind === "UNSAFE" || inspected.scannerOutcome === "MALWARE_DETECTED") {
      await rejectUnsafeReadyAsset(asset, context, inspected.kind === "UNSAFE" ? inspected.failureCode : "MALWARE_DETECTED");
      automationFailure("PERMANENT_FAILURE", false, "UNSAFE_RENDITION_SOURCE");
    }
    if (inspected.scannerOutcome === "SCAN_FAILED") automationFailure("TRANSIENT_FAILURE", true, "SCANNER_FAILURE");
    assertSignal(context);
    const output = await renderMediaRendition(inspected.bytes, payload.profile);
    assertSignal(context);
    const provider = providerFor(asset.provider);
    await ensureRenditionObject(provider, asset.provider, rendition.objectKey, output);
    const metadata = await verifiedOutputMetadata(provider, asset.provider, rendition.objectKey, output);
    assertSignal(context);
    const publication = await prisma.$transaction(async (transaction) => {
      const { now } = await assertJobLease(transaction, context);
      const currentAsset = await transaction.storedAsset.findUnique({
        where: { id: asset.id },
        include: { mediaBindings: { where: { state: "ACTIVE" }, orderBy: { id: "asc" } } },
      });
      const currentRendition = await transaction.mediaRendition.findUnique({ where: { id: rendition.id } });
      const claimOwned = currentRendition
        && currentRendition.claimJobId === context.jobId
        && currentRendition.claimLeaseToken === context.leaseToken
        && currentRendition.claimFencingToken === context.fencingToken;
      const sourceCurrent = Boolean(currentAsset)
        && currentAsset!.checksumSha256 === asset.checksumSha256
        && isMediaRenditionSourceEligible({
          activeSlots: currentAsset!.mediaBindings.map((binding) => binding.slot),
          profile: payload.profile,
          sourceAssetVersion: payload.expectedVersion,
          sourceState: currentAsset!.state,
          sourceVersion: currentAsset!.version,
        });
      if (!claimOwned || !sourceCurrent) {
        if (claimOwned) {
          await transaction.mediaRendition.update({
            where: { id: rendition.id },
            data: {
              checksumSha256: output.checksumSha256,
              claimExpiresAt: null,
              claimFencingToken: null,
              claimJobId: null,
              claimLeaseToken: null,
              height: output.height,
              mimeType: output.mimeType,
              providerObjectVersion: metadata.objectVersion,
              readyAt: now,
              sizeBytes: output.sizeBytes,
              state: "SUPERSEDED",
              version: { increment: 1 },
              width: output.width,
            },
          });
        }
        return { stale: true as const };
      }
      const updated = await transaction.mediaRendition.update({
        where: { id: rendition.id },
        data: {
          checksumSha256: output.checksumSha256,
          claimExpiresAt: null,
          claimFencingToken: null,
          claimJobId: null,
          claimLeaseToken: null,
          failureCode: null,
          height: output.height,
          mimeType: output.mimeType,
          providerObjectVersion: metadata.objectVersion,
          readyAt: now,
          sizeBytes: output.sizeBytes,
          state: "READY",
          version: { increment: 1 },
          width: output.width,
        },
      });
      return { result: renditionMetadata(updated), stale: false as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (publication.stale) automationFailure("PERMANENT_FAILURE", false, "STALE_RENDITION_PUBLICATION");
    return publication.result;
  } catch (error) {
    const failure = error instanceof AutomationFailure ? error : null;
    await failRenditionClaim(rendition.id, context, failure?.safeCode ?? "HANDLER_EXCEPTION", failure?.retryable ?? true);
    throw error;
  }
}

async function deleteMediaRendition(payload: RenditionDeletePayload, context: JobContext) {
  const prepared = await prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    let rendition = await transaction.mediaRendition.findUnique({ where: { id: payload.renditionId } });
    if (!rendition) return { terminal: exact("MEDIA_RENDITION_DELETED", "ABSENT", "ABSENT") };
    if (rendition.state === "DELETED") return { terminal: exact("MEDIA_RENDITION_DELETED", "ABSENT", "DELETED") };
    const retryVersion = rendition.state === "DELETE_PENDING" && rendition.version === payload.expectedVersion + 1;
    if ((!retryVersion && rendition.version !== payload.expectedVersion)
      || !["FAILED", "SUPERSEDED", "DELETE_PENDING"].includes(rendition.state)) {
      return { terminal: exact("MEDIA_RENDITION_DELETED", "STALE", rendition.state) };
    }
    if (rendition.claimJobId && rendition.claimExpiresAt && rendition.claimExpiresAt > now) {
      automationFailure("TRANSIENT_FAILURE", true, "RENDITION_DELETE_BUSY");
    }
    rendition = await transaction.mediaRendition.update({
      where: { id: rendition.id },
      data: {
        claimExpiresAt: job.leaseExpiresAt,
        claimFencingToken: context.fencingToken,
        claimJobId: context.jobId,
        claimLeaseToken: context.leaseToken,
        deleteRequestedAt: rendition.deleteRequestedAt ?? now,
        failureCode: null,
        state: "DELETE_PENDING",
        version: rendition.state === "DELETE_PENDING" ? undefined : { increment: 1 },
      },
    });
    return { rendition, terminal: null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (prepared.terminal) return prepared.terminal;
  const rendition = prepared.rendition!;
  try {
    assertSignal(context);
    const provider = providerFor(rendition.provider);
    const outcome = await callStorageProvider(() => provider.deleteObject({
      objectKey: rendition.objectKey,
      provider: rendition.provider,
    }));
    assertSignal(context);
    if (outcome.outcome !== "READY" && outcome.outcome !== "NOT_FOUND") providerOutcomeFailure(outcome.outcome);
    return await prisma.$transaction(async (transaction) => {
      const { now } = await assertJobLease(transaction, context);
      const changed = await transaction.mediaRendition.updateMany({
        where: {
          claimFencingToken: context.fencingToken,
          claimJobId: context.jobId,
          claimLeaseToken: context.leaseToken,
          id: rendition.id,
          state: "DELETE_PENDING",
          version: rendition.version,
        },
        data: {
          claimExpiresAt: null,
          claimFencingToken: null,
          claimJobId: null,
          claimLeaseToken: null,
          deletedAt: now,
          state: "DELETED",
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) automationFailure("PERMANENT_FAILURE", false, "STALE_RENDITION_DELETE");
      return exact("MEDIA_RENDITION_DELETED", outcome.outcome === "NOT_FOUND" ? "ABSENT" : "COMPLETED", "DELETED");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await releaseRenditionDeleteClaim(rendition.id, rendition.version, context);
    throw error;
  }
}

async function inspectExactAsset(asset: StoredAsset) {
  const provider = providerFor(asset.provider);
  const reference = { objectKey: asset.objectKey, provider: asset.provider } as const;
  const first = await callStorageProvider(() => provider.headObject(reference));
  if (first.outcome !== "READY") {
    if (first.outcome === "NOT_FOUND") return unsafeInspection("SOURCE_NOT_FOUND");
    providerOutcomeFailure(first.outcome);
  }
  if (!sourceMetadataMatches(first, asset)) return unsafeInspection("SOURCE_METADATA_MISMATCH");
  const policy = storagePurposePolicy(asset.purpose);
  const content = await callStorageProvider(() => provider.getObjectForInspection({ ...reference, maxBytes: policy.maxBytes }));
  if (content.outcome !== "READY") {
    if (content.outcome === "NOT_FOUND") return unsafeInspection("SOURCE_NOT_FOUND");
    providerOutcomeFailure(content.outcome);
  }
  if (content.bytes.byteLength !== Number(asset.sizeBytes)) return unsafeInspection("SOURCE_SIZE_MISMATCH");
  const inspection = await inspectStaticRaster(content.bytes);
  if (inspection.checksumSha256 !== asset.checksumSha256
    || (inspection.actualMimeType && inspection.actualMimeType !== asset.mimeType)) {
    return { ...unsafeInspection("SOURCE_CONTENT_MISMATCH"), inspection };
  }
  let scannerOutcome;
  try {
    scannerOutcome = await configuredStorageMalwareScanner().inspect({
      bytes: content.bytes,
      checksumSha256: inspection.checksumSha256,
    });
  } catch {
    scannerOutcome = "SCAN_FAILED" as const;
  }
  if (!["SCANNER_NOT_CONFIGURED", "CLEAN", "MALWARE_DETECTED", "SCAN_FAILED"].includes(scannerOutcome)) {
    scannerOutcome = "SCAN_FAILED" as const;
  }
  const second = await callStorageProvider(() => provider.headObject(reference));
  if (second.outcome !== "READY") {
    if (second.outcome === "NOT_FOUND") return unsafeInspection("SOURCE_NOT_FOUND");
    providerOutcomeFailure(second.outcome);
  }
  if (!sameMetadata(first, second) || !sourceMetadataMatches(second, asset)) {
    return unsafeInspection("SOURCE_CHANGED_DURING_INSPECTION");
  }
  if (inspection.outcome !== "VALID") {
    return { bytes: content.bytes, failureCode: inspection.outcome, inspection, kind: "UNSAFE" as const, scannerOutcome };
  }
  return { bytes: content.bytes, inspection, kind: "VALID" as const, scannerOutcome };
}

async function applyRescanOutcome(
  asset: StoredAsset,
  expectedVersion: number,
  context: JobContext,
  outcome: {
    failureCode: string | null;
    inspection: Awaited<ReturnType<typeof inspectStaticRaster>>;
    scannerOutcome: "SCANNER_NOT_CONFIGURED" | "CLEAN" | "MALWARE_DETECTED" | "SCAN_FAILED";
    state: "READY" | "REJECTED";
  },
) {
  return prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    if (!job.createdByPersonId) automationFailure("PERMANENT_FAILURE", false, "MISSING_JOB_ACTOR");
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "StoredAsset" WHERE "id" = ${asset.id}::uuid FOR UPDATE`);
    const current = await transaction.storedAsset.findUnique({ where: { id: asset.id } });
    if (!current
      || current.version !== expectedVersion
      || current.rescanClaimJobId !== context.jobId
      || current.rescanClaimLeaseToken !== context.leaseToken
      || current.rescanClaimFencingToken !== context.fencingToken) {
      automationFailure("PERMANENT_FAILURE", false, "STALE_RESCAN_CLAIM");
    }
    const bindings = await transaction.mediaBinding.findMany({
      where: { assetId: asset.id, state: "ACTIVE" }, orderBy: { containerId: "asc" },
    });
    if (outcome.state === "REJECTED") {
      for (const containerId of [...new Set(bindings.map((binding) => binding.containerId))]) {
        await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "MediaContainer" WHERE "id" = ${containerId}::uuid FOR UPDATE`);
      }
    }
    const changed = await transaction.storedAsset.updateMany({
      where: { id: asset.id, version: expectedVersion },
      data: {
        failureCode: outcome.failureCode,
        inspectionMetadata: {
          format: outcome.inspection.format,
          height: outcome.inspection.height,
          pages: outcome.inspection.pages,
          width: outcome.inspection.width,
        },
        inspectionOutcome: outcome.inspection.outcome,
        inspectionPolicyVersion: STORAGE_INSPECTION_POLICY_VERSION,
        lastRescannedAt: now,
        quarantinedAt: null,
        readyAt: outcome.state === "READY" ? now : current.readyAt,
        rejectedAt: outcome.state === "REJECTED" ? now : null,
        rescanClaimExpiresAt: null,
        rescanClaimFencingToken: null,
        rescanClaimJobId: null,
        rescanClaimLeaseToken: null,
        scannerOutcome: outcome.scannerOutcome,
        state: outcome.state,
        updatedAt: now,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) automationFailure("PERMANENT_FAILURE", false, "STALE_RESCAN_SOURCE");
    if (outcome.state === "REJECTED") {
      for (const binding of bindings) {
        const detached = await transaction.mediaBinding.updateMany({
          where: { id: binding.id, state: "ACTIVE", version: binding.version },
          data: {
            detachedAt: now,
            detachedByPersonId: job.createdByPersonId,
            state: "DETACHED",
            version: { increment: 1 },
          },
        });
        if (detached.count !== 1) automationFailure("PERMANENT_FAILURE", false, "STALE_RESCAN_BINDING");
        await transaction.mediaContainer.update({ where: { id: binding.containerId }, data: { version: { increment: 1 } } });
      }
    }
    await transaction.mediaRendition.updateMany({
      where: { sourceAssetId: asset.id, state: "READY" },
      data: { state: "SUPERSEDED", updatedAt: now, version: { increment: 1 } },
    });
    return exact("STORAGE_ASSET_RESCANNED", "COMPLETED", outcome.state);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function rejectUnsafeReadyAsset(asset: StoredAsset, context: JobContext, failureCode: string) {
  await prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    if (!job.createdByPersonId) automationFailure("PERMANENT_FAILURE", false, "MISSING_JOB_ACTOR");
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "StoredAsset" WHERE "id" = ${asset.id}::uuid FOR UPDATE`);
    const current = await transaction.storedAsset.findUnique({ where: { id: asset.id } });
    if (!current || current.state !== "READY" || current.version !== asset.version) return;
    const bindings = await transaction.mediaBinding.findMany({
      where: { assetId: asset.id, state: "ACTIVE" }, orderBy: { containerId: "asc" },
    });
    for (const containerId of [...new Set(bindings.map((binding) => binding.containerId))]) {
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "MediaContainer" WHERE "id" = ${containerId}::uuid FOR UPDATE`);
    }
    await transaction.storedAsset.update({
      where: { id: asset.id },
      data: { failureCode, rejectedAt: now, state: "REJECTED", updatedAt: now, version: { increment: 1 } },
    });
    for (const binding of bindings) {
      const detached = await transaction.mediaBinding.updateMany({
        where: { id: binding.id, state: "ACTIVE", version: binding.version },
        data: {
          detachedAt: now,
          detachedByPersonId: job.createdByPersonId,
          state: "DETACHED",
          version: { increment: 1 },
        },
      });
      if (detached.count !== 1) automationFailure("PERMANENT_FAILURE", false, "STALE_RENDITION_BINDING");
      await transaction.mediaContainer.update({ where: { id: binding.containerId }, data: { version: { increment: 1 } } });
    }
    await transaction.mediaRendition.updateMany({
      where: { sourceAssetId: asset.id, state: "READY" },
      data: { state: "SUPERSEDED", updatedAt: now, version: { increment: 1 } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function ensureRenditionObject(
  provider: StorageProvider,
  providerKind: StorageProviderKind,
  objectKey: string,
  output: { bytes: Uint8Array; checksumSha256: string; mimeType: string; sizeBytes: number },
) {
  const reference = { objectKey, provider: providerKind };
  if (!provider.writeObject) automationFailure("PERMANENT_FAILURE", false, "PROVIDER_WRITE_NOT_CONFIGURED");
  const existing = await callStorageProvider(() => provider.headObject(reference));
  if (existing.outcome === "READY") {
    if (!outputMetadataMatches(existing, output)) automationFailure("PERMANENT_FAILURE", false, "OUTPUT_IDENTITY_CONFLICT");
    return;
  }
  if (existing.outcome !== "NOT_FOUND") providerOutcomeFailure(existing.outcome);
  const write = await callStorageProvider(() => provider.writeObject!({
    ...reference,
    bytes: output.bytes,
    checksumSha256: output.checksumSha256,
    contentType: output.mimeType,
  }));
  if (write.outcome !== "READY") {
    const raced = await callStorageProvider(() => provider.headObject(reference));
    if (raced.outcome !== "READY" || !outputMetadataMatches(raced, output)) {
      providerOutcomeFailure(write.outcome);
    }
  } else if (write.writeOnce !== true || !outputMetadataMatches(write, output)) {
    automationFailure("PERMANENT_FAILURE", false, "UNSAFE_OUTPUT_WRITE");
  }
  await verifiedOutputMetadata(provider, providerKind, objectKey, output);
}

async function verifiedOutputMetadata(
  provider: StorageProvider,
  providerKind: StorageProviderKind,
  objectKey: string,
  output: { checksumSha256: string; mimeType: string; sizeBytes: number },
) {
  const metadata = await callStorageProvider(() => provider.headObject({ objectKey, provider: providerKind }));
  if (metadata.outcome !== "READY") {
    if (metadata.outcome === "NOT_FOUND") automationFailure("PERMANENT_FAILURE", false, "OUTPUT_NOT_FOUND");
    providerOutcomeFailure(metadata.outcome);
  }
  if (!outputMetadataMatches(metadata, output)) automationFailure("PERMANENT_FAILURE", false, "OUTPUT_VERIFICATION_MISMATCH");
  const content = await callStorageProvider(() => provider.getObjectForInspection({
    maxBytes: output.sizeBytes,
    objectKey,
    provider: providerKind,
  }));
  if (content.outcome !== "READY") {
    if (content.outcome === "NOT_FOUND") automationFailure("PERMANENT_FAILURE", false, "OUTPUT_NOT_FOUND");
    providerOutcomeFailure(content.outcome);
  }
  if (content.bytes.byteLength !== output.sizeBytes || sha256Hex(content.bytes) !== output.checksumSha256) {
    automationFailure("PERMANENT_FAILURE", false, "OUTPUT_READBACK_MISMATCH");
  }
  return metadata;
}

async function enqueueChild(
  transaction: Prisma.TransactionClient,
  parent: { createdByAdminUserId: string | null; createdByPersonId: string | null },
  parentJobId: string,
  input: {
    availableAt: Date;
    deduplicationKey: string;
    jobType: Exclude<PlatformJobType, "PLATFORM_HEALTH_PROBE">;
    payload: unknown;
  },
) {
  if (!parent.createdByAdminUserId || !parent.createdByPersonId) {
    automationFailure("PERMANENT_FAILURE", false, "DISCOVERY_ACTOR_MISSING");
  }
  const created = await enqueuePlatformJob(transaction, {
    availableAt: input.availableAt,
    createdByAdminUserId: parent.createdByAdminUserId,
    createdByPersonId: parent.createdByPersonId,
    deduplicationKey: input.deduplicationKey,
    jobType: input.jobType,
    maxAttempts: 5,
    parentJobId,
    payload: input.payload,
    payloadVersion: 1,
    source: "DOMAIN_DISCOVERY",
  });
  return !created.replay;
}

async function assertJobLease(transaction: Prisma.TransactionClient, context: JobContext) {
  assertSignal(context);
  const now = await databaseNow(transaction);
  const job = await transaction.platformJob.findFirst({
    where: {
      fencingToken: context.fencingToken,
      id: context.jobId,
      leaseExpiresAt: { gt: now },
      leaseToken: context.leaseToken,
      status: "RUNNING",
    },
    select: {
      createdByAdminUserId: true,
      createdByPersonId: true,
      leaseExpiresAt: true,
      source: true,
    },
  });
  if (!job?.leaseExpiresAt) automationFailure("PERMANENT_FAILURE", false, "STALE_JOB_LEASE");
  return { job, now };
}

function providerFor(kind: StorageProviderKind) {
  const provider = configuredStorageProvider();
  if (provider.kind === "NOT_CONFIGURED") automationFailure("PERMANENT_FAILURE", false, "PROVIDER_NOT_CONFIGURED");
  if (provider.kind !== kind) automationFailure("PERMANENT_FAILURE", false, "PROVIDER_IDENTITY_MISMATCH");
  return provider;
}

function providerOutcomeFailure(outcome: Exclude<StorageProviderOutcome, "READY" | "NOT_FOUND">): never {
  if (outcome === "TRANSIENT_FAILURE") automationFailure("TRANSIENT_FAILURE", true, "PROVIDER_TRANSIENT_FAILURE");
  if (outcome === "NOT_CONFIGURED") automationFailure("PERMANENT_FAILURE", false, "PROVIDER_NOT_CONFIGURED");
  automationFailure("PERMANENT_FAILURE", false, "PROVIDER_PERMANENT_FAILURE");
}

function sourceMetadataMatches(metadata: Extract<ObjectMetadataResult, { outcome: "READY" }>, asset: StoredAsset) {
  return metadata.sizeBytes === Number(asset.sizeBytes)
    && metadata.contentType === asset.mimeType
    && (!metadata.checksumSha256 || metadata.checksumSha256 === asset.checksumSha256)
    && metadata.objectVersion === asset.providerObjectVersion;
}

function sameMetadata(
  left: Extract<ObjectMetadataResult, { outcome: "READY" }>,
  right: Extract<ObjectMetadataResult, { outcome: "READY" }>,
) {
  return left.sizeBytes === right.sizeBytes
    && left.contentType === right.contentType
    && left.checksumSha256 === right.checksumSha256
    && left.objectVersion === right.objectVersion;
}

function outputMetadataMatches(
  metadata: { checksumSha256: string | null; contentType: string; sizeBytes: number },
  output: { checksumSha256: string; mimeType: string; sizeBytes: number },
) {
  return metadata.checksumSha256 === output.checksumSha256
    && metadata.contentType === output.mimeType
    && metadata.sizeBytes === output.sizeBytes;
}

function unsafeInspection(failureCode: string) {
  return {
    bytes: new Uint8Array(),
    failureCode,
    inspection: {
      actualMimeType: null,
      checksumSha256: "0".repeat(64),
      format: null,
      height: null,
      outcome: "INVALID_STRUCTURE" as const,
      pages: null,
      width: null,
    },
    kind: "UNSAFE" as const,
    scannerOutcome: "SCANNER_NOT_CONFIGURED" as const,
  };
}

function renditionMetadata(rendition: {
  height: number | null;
  profile: MediaRenditionProfile;
  sizeBytes: bigint | null;
  state: string;
  width: number | null;
}) {
  if (rendition.state !== "READY" || !rendition.height || !rendition.width || !rendition.sizeBytes) {
    automationFailure("PERMANENT_FAILURE", false, "INVALID_RENDITION_RESULT");
  }
  return {
    height: rendition.height,
    kind: "MEDIA_RENDITION_GENERATED" as const,
    profile: rendition.profile,
    sizeBytes: Number(rendition.sizeBytes),
    state: "READY" as const,
    width: rendition.width,
  };
}

function exact(kind: string, outcome: "COMPLETED" | "ABSENT" | "STALE" | "SUPERSEDED", state: string) {
  return { kind, outcome, state };
}

function success(metadata: unknown): PlatformJobHandlerResult {
  return { metadata, outcome: "SUCCEEDED" };
}

function assertSignal(context: JobContext) {
  if (context.signal.aborted) automationFailure("HANDLER_ABORTED", false, "HANDLER_ABORTED");
}

function assertClaimAvailable(claimId: string | null, claimedAt: Date | null, now: Date) {
  if (claimId && claimedAt
    && claimedAt.getTime() > now.getTime() - STORAGE_PROVIDER_CLAIM_TTL_MS) {
    automationFailure("TRANSIENT_FAILURE", true, "CLEANUP_CLAIM_BUSY");
  }
}

function assertRescanClaimAvailable(asset: StoredAsset, now: Date) {
  if (asset.rescanClaimLeaseToken && asset.rescanClaimExpiresAt && asset.rescanClaimExpiresAt > now) {
    automationFailure("TRANSIENT_FAILURE", true, "RESCAN_CLAIM_BUSY");
  }
}

async function releaseSessionCleanupClaim(id: string, version: number, leaseToken: string) {
  await prisma.uploadSession.updateMany({
    where: { id, providerCleanupClaimId: leaseToken, state: "EXPIRED", version },
    data: { providerCleanupClaimId: null, providerCleanupClaimedAt: null },
  });
}

async function releaseAssetCleanupClaim(id: string, version: number, leaseToken: string) {
  await prisma.storedAsset.updateMany({
    where: { id, providerCleanupClaimId: leaseToken, state: "DELETE_PENDING", version },
    data: { providerCleanupClaimId: null, providerCleanupClaimedAt: null },
  });
}

async function releaseRescanClaim(id: string, version: number, context: JobContext) {
  await prisma.storedAsset.updateMany({
    where: { id, rescanClaimJobId: context.jobId, rescanClaimLeaseToken: context.leaseToken, version },
    data: {
      rescanClaimExpiresAt: null,
      rescanClaimFencingToken: null,
      rescanClaimJobId: null,
      rescanClaimLeaseToken: null,
    },
  });
}

async function failRenditionClaim(id: string, context: JobContext, failureCode: string, retryable: boolean) {
  await prisma.mediaRendition.updateMany({
    where: { claimFencingToken: context.fencingToken, claimJobId: context.jobId, claimLeaseToken: context.leaseToken, id },
    data: {
      claimExpiresAt: null,
      claimFencingToken: null,
      claimJobId: null,
      claimLeaseToken: null,
      failureCode: retryable ? null : failureCode.slice(0, 80),
      state: retryable ? "PENDING" : "FAILED",
      version: { increment: 1 },
    },
  });
}

async function releaseRenditionDeleteClaim(id: string, version: number, context: JobContext) {
  await prisma.mediaRendition.updateMany({
    where: {
      claimFencingToken: context.fencingToken,
      claimJobId: context.jobId,
      claimLeaseToken: context.leaseToken,
      id,
      state: "DELETE_PENDING",
      version,
    },
    data: {
      claimExpiresAt: null,
      claimFencingToken: null,
      claimJobId: null,
      claimLeaseToken: null,
    },
  });
}

async function databaseNow(transaction: Prisma.TransactionClient) {
  const [row] = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
  if (!row) automationFailure("TRANSIENT_FAILURE", true, "DATABASE_TIME_UNAVAILABLE");
  return row.now;
}

class AutomationFailure extends Error {
  constructor(
    readonly errorCode: PlatformJobErrorCode,
    readonly retryable: boolean,
    readonly safeCode: string,
  ) {
    super("Storage/media automation failed safely.");
    this.name = "AutomationFailure";
  }
}

function automationFailure(errorCode: PlatformJobErrorCode, retryable: boolean, safeCode: string): never {
  throw new AutomationFailure(errorCode, retryable, safeCode);
}
