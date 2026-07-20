import "server-only";

import { Prisma } from "@prisma/client";

import { storedAssetDetailDto } from "@/features/storage/domain/contracts";
import { storageError } from "@/features/storage/domain/errors";
import {
  isUuid,
  STORAGE_ORPHAN_RETENTION_MS,
  STORAGE_PROVIDER_CLAIM_TTL_MS,
  storageRequestHash,
} from "@/features/storage/domain/policy";
import { storageProviderFor } from "@/features/storage/providers/registry";
import { callStorageProvider } from "@/features/storage/providers/provider";
import type { StorageAdminActor } from "@/features/storage/services/actor";
import { assertStorageAdminCurrent } from "@/features/storage/services/actor";
import { storageSerializable } from "@/features/storage/services/transaction";

export async function rejectStoredAsset(
  actor: StorageAdminActor,
  input: { assetId: string; expectedVersion: number; idempotencyKey: string },
) {
  if (!isUuid(input.assetId) || !isUuid(input.idempotencyKey)
    || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    storageError("VALIDATION_ERROR", "Reject request is invalid.");
  }
  const requestHash = storageRequestHash({ action: "ADMIN_REJECT_ASSET", actor: adminScope(actor), ...input });
  return storageSerializable(async (transaction) => {
    await assertStorageAdminCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lock(transaction, `storage-mutation:${actor.personId}:${input.idempotencyKey}`);
    const existing = await transaction.storageMutation.findUnique({
      where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing && (existing.action !== "ADMIN_REJECT_ASSET" || existing.requestHash !== requestHash)) {
      storageError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another storage request.");
    }
    if (existing?.status === "COMPLETED" && existing.result) {
      return existing.result as ReturnType<typeof storedAssetDetailDto>;
    }
    const existingMediaMutation = await transaction.mediaMutation.findUnique({
      where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey: input.idempotencyKey } },
    });
    if (existingMediaMutation
      && (existingMediaMutation.action !== "ADMIN_DETACH_REJECTED_MEDIA"
        || existingMediaMutation.requestHash !== requestHash)) {
      storageError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another media request.");
    }
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "StoredAsset" WHERE "id" = ${input.assetId}::uuid FOR UPDATE`,
    );
    const asset = await transaction.storedAsset.findUnique({ where: { id: input.assetId } });
    if (!asset) storageError("NOT_FOUND", "Stored asset was not found.");
    if (asset.version !== input.expectedVersion) storageError("STALE_VERSION", "Stored asset version is stale.");
    if (["DELETE_PENDING", "DELETED", "REJECTED"].includes(asset.state)) {
      storageError("ASSET_NOT_READY", "Stored asset cannot be rejected from its current state.");
    }
    if (!existing) {
      await transaction.storageMutation.create({
        data: {
          action: "ADMIN_REJECT_ASSET",
          actorPersonId: actor.personId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          targetId: asset.id,
          targetType: "StoredAsset",
        },
      });
    }
    const now = await databaseNow(transaction);
    const activeBinding = await transaction.mediaBinding.findFirst({
      where: { assetId: asset.id, state: "ACTIVE" },
      include: { container: true },
    });
    let lockedContainer = null;
    if (activeBinding) {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "MediaContainer" WHERE "id" = ${activeBinding.containerId}::uuid FOR UPDATE`,
      );
      lockedContainer = await transaction.mediaContainer.findUniqueOrThrow({ where: { id: activeBinding.containerId } });
    }
    const changed = await transaction.storedAsset.updateMany({
      where: { id: asset.id, version: input.expectedVersion },
      data: { failureCode: "ADMIN_REJECTED", rejectedAt: now, state: "REJECTED", version: { increment: 1 } },
    });
    if (changed.count !== 1) storageError("STALE_VERSION", "Stored asset changed before rejection.");
    let rejectedContainerVersion: number | null = null;
    if (activeBinding) {
      const detached = await transaction.mediaBinding.updateMany({
        where: { id: activeBinding.id, state: "ACTIVE", version: activeBinding.version },
        data: {
          detachedAt: now,
          detachedByPersonId: actor.personId,
          state: "DETACHED",
          version: { increment: 1 },
        },
      });
      if (detached.count !== 1) storageError("STALE_VERSION", "Attached media changed before rejection.");
      const container = await transaction.mediaContainer.update({
        where: { id: activeBinding.containerId },
        data: { version: { increment: 1 } },
      });
      rejectedContainerVersion = container.version;
      await transaction.mediaMutation.create({
        data: {
          action: "ADMIN_DETACH_REJECTED_MEDIA",
          actorPersonId: actor.personId,
          containerId: container.id,
          expectedVersion: lockedContainer!.version,
          idempotencyKey: input.idempotencyKey,
          organizationId: container.organizationId,
          requestHash,
          result: {
            type: "ADMIN_MEDIA_REJECTION",
            assetId: asset.id,
            bindingDetached: true,
            containerVersion: container.version,
            state: "REJECTED",
          },
          resultVersion: container.version,
          status: "COMPLETED",
        },
      });
    }
    const updated = await transaction.storedAsset.findUniqueOrThrow({ where: { id: asset.id } });
    const dto = storedAssetDetailDto(updated);
    await transaction.storageMutation.update({
      where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey: input.idempotencyKey } },
      data: { result: dto, status: "COMPLETED", targetId: asset.id },
    });
    await transaction.adminAuditLog.create({
      data: {
        action: "storage.asset.reject",
        adminUserId: actor.userId,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          bindingDetached: Boolean(activeBinding),
          containerVersion: rejectedContainerVersion,
          purpose: updated.purpose,
          state: updated.state,
          visibility: updated.visibility,
        },
        requestHash,
        result: { state: updated.state },
        resultVersion: updated.updatedAt,
        targetId: updated.id,
        targetType: "StoredAsset",
      },
    });
    return dto;
  });
}

export async function runManualStorageCleanup(
  actor: StorageAdminActor,
  input: { batchSize?: number; idempotencyKey: string },
) {
  if (!isUuid(input.idempotencyKey)) storageError("VALIDATION_ERROR", "idempotencyKey must be a UUID.");
  const batchSize = input.batchSize ?? 50;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    storageError("VALIDATION_ERROR", "batchSize must be between 1 and 100.");
  }
  const requestHash = storageRequestHash({ action: "MANUAL_CLEANUP", actor: adminScope(actor), batchSize });
  const prepared = await storageSerializable(async (transaction) => {
    await assertStorageAdminCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lock(transaction, `storage-mutation:${actor.personId}:${input.idempotencyKey}`);
    const existing = await transaction.storageMutation.findUnique({
      where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing && (existing.action !== "MANUAL_CLEANUP" || existing.requestHash !== requestHash)) {
      storageError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another storage cleanup request.");
    }
    if (existing?.status === "COMPLETED" && existing.result) return { replay: existing.result, candidates: null };
    if (!existing) {
      await transaction.storageMutation.create({
        data: {
          action: "MANUAL_CLEANUP",
          actorPersonId: actor.personId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          targetType: "StorageCleanup",
        },
      });
    }
    const now = await databaseNow(transaction);
    const staleClaimBoundary = new Date(now.getTime() - STORAGE_PROVIDER_CLAIM_TTL_MS);
    if (existing?.status === "PROCESSING" && existing.updatedAt > staleClaimBoundary) {
      storageError("STORAGE_PROVIDER_FAILURE", "Storage cleanup is already in progress.");
    }
    const expiring = await transaction.uploadSession.findMany({
      where: { expiresAt: { lte: now }, state: { in: ["CREATED", "TARGET_ISSUED", "UPLOADED"] } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: batchSize,
    });
    const expired = await transaction.uploadSession.updateMany({
      where: { id: { in: expiring.map((session) => session.id) }, state: { in: ["CREATED", "TARGET_ISSUED", "UPLOADED"] } },
      data: { failureCode: "SESSION_EXPIRED", state: "EXPIRED", version: { increment: 1 } },
    });
    const retentionBoundary = new Date(now.getTime() - STORAGE_ORPHAN_RETENTION_MS);
    const claimable = {
      OR: [
        { providerCleanupClaimId: null },
        { providerCleanupClaimedAt: { lte: staleClaimBoundary } },
      ],
    } satisfies Prisma.UploadSessionWhereInput;
    const [orphanSessions, deletePending] = await Promise.all([
      transaction.uploadSession.findMany({
        where: {
          asset: null,
          AND: [
            {
              OR: [
                { failureCode: null },
                { failureCode: { not: "ORPHAN_OBJECT_DELETED" } },
              ],
            },
          ],
          expiresAt: { lte: retentionBoundary },
          ...claimable,
          provider: { not: "NOT_CONFIGURED" },
          state: "EXPIRED",
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: batchSize,
      }),
      transaction.storedAsset.findMany({
        where: { ...claimable, state: "DELETE_PENDING" },
        orderBy: [{ deleteRequestedAt: "asc" }, { id: "asc" }],
        take: batchSize,
      }),
    ]);
    const providerClaim = input.idempotencyKey;
    if (orphanSessions.length) {
      await transaction.uploadSession.updateMany({
        where: { id: { in: orphanSessions.map((session) => session.id) }, state: "EXPIRED" },
        data: { providerCleanupClaimedAt: now, providerCleanupClaimId: providerClaim },
      });
    }
    if (deletePending.length) {
      await transaction.storedAsset.updateMany({
        where: { id: { in: deletePending.map((asset) => asset.id) }, state: "DELETE_PENDING" },
        data: { providerCleanupClaimedAt: now, providerCleanupClaimId: providerClaim },
      });
    }
    return { candidates: { deletePending, expiredCount: expired.count, orphanSessions, providerClaim }, replay: null };
  });
  if (prepared.replay) return prepared.replay as StorageCleanupResult;

  let orphanObjectsDeleted = 0;
  let orphanDeleteFailures = 0;
  let deletePendingCompleted = 0;
  let deletePendingFailures = 0;
  const deletedAssetIds: string[] = [];
  const failedAssetIds: string[] = [];
  const deletedOrphanSessionIds: string[] = [];
  const failedOrphanSessionIds: string[] = [];
  for (const session of prepared.candidates!.orphanSessions) {
    const provider = storageProviderFor(session.provider);
    const outcome = await callStorageProvider(() => provider.deleteObject({ objectKey: session.objectKey, provider: session.provider }));
    if (outcome.outcome === "READY" || outcome.outcome === "NOT_FOUND") {
      orphanObjectsDeleted += 1;
      deletedOrphanSessionIds.push(session.id);
    } else {
      orphanDeleteFailures += 1;
      failedOrphanSessionIds.push(session.id);
    }
  }
  for (const asset of prepared.candidates!.deletePending) {
    const provider = storageProviderFor(asset.provider);
    const outcome = await callStorageProvider(() => provider.deleteObject({ objectKey: asset.objectKey, provider: asset.provider }));
    if (outcome.outcome === "READY" || outcome.outcome === "NOT_FOUND") {
      deletePendingCompleted += 1;
      deletedAssetIds.push(asset.id);
    } else {
      deletePendingFailures += 1;
      failedAssetIds.push(asset.id);
    }
  }

  return storageSerializable(async (transaction) => {
    await assertStorageAdminCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    const now = await databaseNow(transaction);
    if (deletedOrphanSessionIds.length) {
      await transaction.uploadSession.updateMany({
        where: {
          id: { in: deletedOrphanSessionIds },
          providerCleanupClaimId: prepared.candidates!.providerClaim,
          state: "EXPIRED",
        },
        data: {
          failureCode: "ORPHAN_OBJECT_DELETED",
          providerCleanupClaimedAt: null,
          providerCleanupClaimId: null,
        },
      });
    }
    if (failedOrphanSessionIds.length) {
      await transaction.uploadSession.updateMany({
        where: {
          id: { in: failedOrphanSessionIds },
          providerCleanupClaimId: prepared.candidates!.providerClaim,
          state: "EXPIRED",
        },
        data: {
          failureCode: "ORPHAN_DELETE_FAILED",
          providerCleanupClaimedAt: null,
          providerCleanupClaimId: null,
        },
      });
    }
    if (deletedAssetIds.length) {
      await transaction.storedAsset.updateMany({
        where: {
          id: { in: deletedAssetIds },
          providerCleanupClaimId: prepared.candidates!.providerClaim,
          state: "DELETE_PENDING",
        },
        data: {
          deletedAt: now,
          providerCleanupClaimedAt: null,
          providerCleanupClaimId: null,
          state: "DELETED",
          version: { increment: 1 },
        },
      });
    }
    if (failedAssetIds.length) {
      await transaction.storedAsset.updateMany({
        where: {
          id: { in: failedAssetIds },
          providerCleanupClaimId: prepared.candidates!.providerClaim,
          state: "DELETE_PENDING",
        },
        data: { providerCleanupClaimedAt: null, providerCleanupClaimId: null },
      });
    }
    const result: StorageCleanupResult = {
      type: "STORAGE_CLEANUP_RESULT" as const,
      deletePendingCompleted,
      deletePendingFailures,
      expiredSessions: prepared.candidates!.expiredCount,
      orphanDeleteFailures,
      orphanObjectsDeleted,
      scannedDeletePending: prepared.candidates!.deletePending.length,
      scannedOrphanSessions: prepared.candidates!.orphanSessions.length,
    };
    await transaction.storageMutation.update({
      where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey: input.idempotencyKey } },
      data: { result, status: "COMPLETED" },
    });
    await transaction.adminAuditLog.create({
      data: {
        action: "storage.cleanup.manual",
        adminUserId: actor.userId,
        idempotencyKey: input.idempotencyKey,
        metadata: result,
        requestHash,
        result: result,
        resultVersion: now,
        targetType: "StorageCleanup",
      },
    });
    return result;
  });
}

type StorageCleanupResult = {
  type: "STORAGE_CLEANUP_RESULT";
  deletePendingCompleted: number;
  deletePendingFailures: number;
  expiredSessions: number;
  orphanDeleteFailures: number;
  orphanObjectsDeleted: number;
  scannedDeletePending: number;
  scannedOrphanSessions: number;
};

function adminScope(actor: StorageAdminActor) {
  return {
    adminAccessId: actor.adminAccessId,
    personId: actor.personId,
    source: actor.source,
    userId: actor.userId,
  };
}

async function lock(transaction: Prisma.TransactionClient, scope: string) {
  await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
}

async function databaseNow(transaction: Prisma.TransactionClient) {
  const [row] = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
  if (!row) throw new Error("Database time is unavailable.");
  return row.now;
}
