import "server-only";

import { Prisma, type StoredAsset } from "@prisma/client";

import { storedAssetDetailDto, storedAssetSummaryDto } from "@/features/storage/domain/contracts";
import { storageError } from "@/features/storage/domain/errors";
import {
  isUuid,
  storageRequestHash,
  STORAGE_PROVIDER_CLAIM_TTL_MS,
  STORAGE_TARGET_TTL_SECONDS,
} from "@/features/storage/domain/policy";
import { isDeliverableAssetState } from "@/features/storage/domain/lifecycle";
import { storagePurposePolicy } from "@/features/storage/domain/purpose-registry";
import { storageProviderFor } from "@/features/storage/providers/registry";
import { callStorageProvider, type StorageProviderOutcome } from "@/features/storage/providers/provider";
import {
  assertStorageActorCurrent,
  assertStorageAdminCurrent,
  type StorageActor,
  type StorageAdminActor,
} from "@/features/storage/services/actor";
import { storageSerializable } from "@/features/storage/services/transaction";

export type AssetAccessActor = StorageActor | StorageAdminActor;

export async function getStoredAsset(actor: AssetAccessActor, assetId: string) {
  if (!isUuid(assetId)) storageError("VALIDATION_ERROR", "assetId must be a UUID.");
  return storageSerializable(async (transaction) => {
    await assertActor(transaction, actor, "STORAGE_RECORDS_VIEW");
    const asset = await accessibleAsset(transaction, actor, assetId);
    return storedAssetDetailDto(asset);
  });
}

export async function createDownloadTarget(
  actor: AssetAccessActor | null,
  assetId: string,
) {
  if (!isUuid(assetId)) storageError("VALIDATION_ERROR", "assetId must be a UUID.");
  const prepared = await storageSerializable(async (transaction) => {
    const value = await transaction.storedAsset.findUnique({ where: { id: assetId } });
    if (!value || !isDeliverableAssetState(value.state)) {
      storageError("NOT_FOUND", "Stored asset was not found.");
    }
    const policy = storagePurposePolicy(value.purpose);
    if (value.visibility === "PUBLIC" && policy.publicDeliveryPermitted) {
      return { asset: value, expiresAt: new Date((await databaseNow(transaction)).getTime() + STORAGE_TARGET_TTL_SECONDS * 1000) };
    }
    if (!actor) storageError("NOT_FOUND", "Stored asset was not found.");
    await assertActor(transaction, actor, "STORAGE_RECORDS_VIEW");
    if (value.visibility === "PRIVATE" && actor.kind !== "admin" && actorCanAccessOwner(actor, value)) {
      return { asset: value, expiresAt: new Date((await databaseNow(transaction)).getTime() + STORAGE_TARGET_TTL_SECONDS * 1000) };
    }
    if (value.visibility === "INTERNAL" && actor.kind === "admin") {
      return { asset: value, expiresAt: new Date((await databaseNow(transaction)).getTime() + STORAGE_TARGET_TTL_SECONDS * 1000) };
    }
    storageError("NOT_FOUND", "Stored asset was not found.");
  });
  const { asset, expiresAt } = prepared;
  const provider = storageProviderFor(asset.provider);
  const target = await callStorageProvider(() => provider.createDownloadTarget({
    expiresAt,
    objectKey: asset.objectKey,
    provider: asset.provider,
    visibility: asset.visibility,
  }));
  if (target.outcome !== "READY") providerError(target.outcome);
  if (target.expiresAt.getTime() !== expiresAt.getTime() || !safeHttpsTarget(target.url)) {
    storageError("STORAGE_PROVIDER_FAILURE", "Managed storage provider returned an unsafe download target.");
  }
  return {
    type: "DOWNLOAD_TARGET" as const,
    assetId: asset.id,
    expiresAt: target.expiresAt.toISOString(),
    url: target.url,
  };
}

export async function deleteStoredAsset(
  actor: AssetAccessActor,
  input: { assetId: string; expectedVersion: number; idempotencyKey: string },
) {
  if (!isUuid(input.assetId) || !isUuid(input.idempotencyKey)) {
    storageError("VALIDATION_ERROR", "assetId and idempotencyKey must be UUIDs.");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    storageError("VALIDATION_ERROR", "expectedVersion must be a positive integer.");
  }
  const requestHash = storageRequestHash({
    action: "DELETE_ASSET",
    actor: safeActorScope(actor),
    assetId: input.assetId,
    expectedVersion: input.expectedVersion,
  });
  const prepared = await storageSerializable(async (transaction) => {
    await assertActor(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lock(transaction, `storage-mutation:${actor.personId}:${input.idempotencyKey}`);
    const mutation = await transaction.storageMutation.findUnique({
      where: {
        actorPersonId_idempotencyKey: {
          actorPersonId: actor.personId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (mutation && (mutation.action !== "DELETE_ASSET"
      || mutation.requestHash !== requestHash
      || mutation.organizationId !== organizationId(actor))) {
      storageError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different storage request.");
    }
    if (mutation?.status === "COMPLETED" && mutation.result) return { replay: mutation.result, asset: null };
    let asset = await manageableAsset(transaction, actor, input.assetId);
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "StoredAsset" WHERE "id" = ${asset.id}::uuid FOR UPDATE`,
    );
    asset = await manageableAsset(transaction, actor, input.assetId);
    const activeBinding = await transaction.mediaBinding.findFirst({
      where: { assetId: asset.id, state: "ACTIVE" },
      select: { id: true },
    });
    if (activeBinding) storageError("ASSET_IN_USE", "Stored asset is attached to active media.");
    const retryingExistingMutation = Boolean(mutation);
    if (!mutation) {
      await transaction.storageMutation.create({
        data: {
          action: "DELETE_ASSET",
          actorPersonId: actor.personId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          organizationId: organizationId(actor),
          requestHash,
          targetId: asset.id,
          targetType: "StoredAsset",
        },
      });
    }
    if (asset.state === "DELETED") storageError("NOT_FOUND", "Stored asset was not found.");
    const now = await databaseNow(transaction);
    const providerClaim = input.idempotencyKey;
    if (asset.state === "DELETE_PENDING") {
      if (!retryingExistingMutation || asset.version !== input.expectedVersion + 1) {
        storageError("STALE_VERSION", "Stored asset version is stale.");
      }
      if (isFreshProviderClaim(asset.providerCleanupClaimId, asset.providerCleanupClaimedAt, now)) {
        storageError("STORAGE_PROVIDER_FAILURE", "Stored asset deletion is already in progress.");
      }
      await transaction.storedAsset.updateMany({
        where: { id: asset.id, state: "DELETE_PENDING", version: asset.version },
        data: { providerCleanupClaimedAt: now, providerCleanupClaimId: providerClaim },
      });
      return {
        replay: null,
        asset: await transaction.storedAsset.findUniqueOrThrow({ where: { id: asset.id } }),
        providerClaim,
      };
    }
    if (asset.version !== input.expectedVersion) storageError("STALE_VERSION", "Stored asset version is stale.");
    const changed = await transaction.storedAsset.updateMany({
      where: { id: asset.id, state: { notIn: ["DELETE_PENDING", "DELETED"] }, version: input.expectedVersion },
      data: {
        deleteRequestedAt: now,
        providerCleanupClaimedAt: now,
        providerCleanupClaimId: providerClaim,
        state: "DELETE_PENDING",
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) storageError("STALE_VERSION", "Stored asset changed before deletion.");
    return {
      replay: null,
      asset: await transaction.storedAsset.findUniqueOrThrow({ where: { id: asset.id } }),
      providerClaim,
    };
  });
  if (prepared.replay) return prepared.replay as ReturnType<typeof storedAssetDetailDto>;
  const provider = storageProviderFor(prepared.asset!.provider);
  const result = await callStorageProvider(() => provider.deleteObject({
    objectKey: prepared.asset!.objectKey,
    provider: prepared.asset!.provider,
  }));
  if (result.outcome !== "READY" && result.outcome !== "NOT_FOUND") {
    await storageSerializable(async (transaction) => {
      await transaction.storageMutation.update({
        where: {
          actorPersonId_idempotencyKey: {
            actorPersonId: actor.personId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        data: { failureCode: safeProviderFailure(result.outcome), status: "FAILED" },
      });
      await transaction.storedAsset.updateMany({
        where: {
          id: prepared.asset!.id,
          providerCleanupClaimId: prepared.providerClaim,
          state: "DELETE_PENDING",
          version: prepared.asset!.version,
        },
        data: { providerCleanupClaimedAt: null, providerCleanupClaimId: null },
      });
    });
    providerError(result.outcome);
  }
  return storageSerializable(async (transaction) => {
    await assertActor(transaction, actor, "STORAGE_RECORDS_MANAGE");
    const now = await databaseNow(transaction);
    const changed = await transaction.storedAsset.updateMany({
      where: {
        id: prepared.asset!.id,
        providerCleanupClaimId: prepared.providerClaim,
        state: "DELETE_PENDING",
        version: prepared.asset!.version,
      },
      data: {
        deletedAt: now,
        providerCleanupClaimedAt: null,
        providerCleanupClaimId: null,
        state: "DELETED",
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      const current = await transaction.storedAsset.findUnique({ where: { id: prepared.asset!.id } });
      if (!current || current.state !== "DELETED") storageError("STALE_VERSION", "Stored asset changed during deletion.");
    }
    const asset = await transaction.storedAsset.findUniqueOrThrow({ where: { id: prepared.asset!.id } });
    const dto = storedAssetDetailDto(asset);
    await transaction.storageMutation.update({
      where: {
        actorPersonId_idempotencyKey: {
          actorPersonId: actor.personId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      data: { failureCode: null, result: dto, status: "COMPLETED", targetId: asset.id },
    });
    if (actor.kind === "admin") {
      await transaction.adminAuditLog.upsert({
        where: { adminUserId_idempotencyKey: { adminUserId: actor.userId, idempotencyKey: input.idempotencyKey } },
        create: {
          action: "storage.asset.delete",
          adminUserId: actor.userId,
          idempotencyKey: input.idempotencyKey,
          metadata: { purpose: asset.purpose, state: asset.state, visibility: asset.visibility },
          requestHash,
          result: { state: asset.state },
          resultVersion: asset.updatedAt,
          targetId: asset.id,
          targetType: "StoredAsset",
        },
        update: {},
      });
    }
    return dto;
  });
}

export function assetSummaryForAdmin(asset: StoredAsset) {
  return storedAssetSummaryDto(asset);
}

async function accessibleAsset(
  transaction: Prisma.TransactionClient,
  actor: AssetAccessActor,
  assetId: string,
) {
  const asset = await transaction.storedAsset.findUnique({ where: { id: assetId } });
  if (!asset) storageError("NOT_FOUND", "Stored asset was not found.");
  if (actor.kind === "admin" || actorCanAccessOwner(actor, asset)) return asset;
  storageError("NOT_FOUND", "Stored asset was not found.");
}

async function manageableAsset(
  transaction: Prisma.TransactionClient,
  actor: AssetAccessActor,
  assetId: string,
) {
  const asset = await accessibleAsset(transaction, actor, assetId);
  if (actor.kind === "admin" && asset.visibility !== "INTERNAL") {
    storageError("FORBIDDEN", "Admin deletion is limited to internal storage assets.");
  }
  return asset;
}

function actorCanAccessOwner(actor: StorageActor, asset: StoredAsset) {
  return actor.kind === "customer"
    ? asset.ownerPersonId === actor.personId && asset.organizationId === null
    : asset.organizationId === actor.organizationId;
}

async function assertActor(
  transaction: Prisma.TransactionClient,
  actor: AssetAccessActor,
  permission: "STORAGE_RECORDS_VIEW" | "STORAGE_RECORDS_MANAGE",
) {
  return actor.kind === "admin"
    ? assertStorageAdminCurrent(transaction, actor, permission)
    : assertStorageActorCurrent(transaction, actor);
}

function organizationId(actor: AssetAccessActor) {
  return actor.kind === "business" ? actor.organizationId : null;
}

function safeActorScope(actor: AssetAccessActor) {
  return {
    kind: actor.kind,
    organizationId: organizationId(actor),
    personId: actor.personId,
    ...(actor.kind === "business" ? { membershipId: actor.membershipId, roleId: actor.roleId } : {}),
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

function safeProviderFailure(outcome: StorageProviderOutcome) {
  return outcome === "TRANSIENT_FAILURE" ? "PROVIDER_TRANSIENT_FAILURE" : "PROVIDER_FAILURE";
}

function isFreshProviderClaim(claimId: string | null, claimedAt: Date | null, now: Date) {
  return Boolean(
    claimId
    && claimedAt
    && claimedAt.getTime() > now.getTime() - STORAGE_PROVIDER_CLAIM_TTL_MS,
  );
}

function providerError(outcome: Exclude<StorageProviderOutcome, "READY">): never {
  if (outcome === "NOT_CONFIGURED") {
    storageError("STORAGE_PROVIDER_NOT_CONFIGURED", "Managed storage provider is not configured.");
  }
  if (outcome === "NOT_FOUND") storageError("ASSET_NOT_READY", "Stored object is unavailable.");
  storageError("STORAGE_PROVIDER_FAILURE", "Managed storage provider request failed.");
}

function safeHttpsTarget(value: string) {
  if (value.length > 8_192) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
