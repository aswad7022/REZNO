import "server-only";

import {
  Prisma,
  type MediaBinding,
  type MediaContainer,
  type MediaMutationAction,
  type MediaSlot,
  type StoredAsset,
} from "@prisma/client";

import { mediaContainerDto } from "@/features/media/domain/contracts";
import { mediaError } from "@/features/media/domain/errors";
import {
  assertSlotKind,
  mediaRequestHash,
  normalizeAltText,
  targetKey,
  type MediaTarget,
} from "@/features/media/domain/policy";
import { mediaSlotPolicy } from "@/features/media/domain/slot-registry";
import { isUuid } from "@/features/storage/domain/policy";
import { storagePurposePolicy } from "@/features/storage/domain/purpose-registry";
import type { StorageActor } from "@/features/storage/services/actor";
import {
  assertProductVariant,
  findAndLockContainer,
  resolveWritableMediaTarget,
} from "@/features/media/services/targets";
import {
  databaseNow,
  lockMediaScope,
  mediaSerializable,
} from "@/features/media/services/transaction";

type AttachMediaInput = Readonly<{
  altText?: unknown;
  assetId: string;
  expectedVersion: number;
  idempotencyKey: string;
  productVariantId?: string | null;
  slot: MediaSlot;
  target: MediaTarget;
}>;

type BindingMutationInput = Readonly<{
  bindingId: string;
  expectedVersion: number;
  idempotencyKey: string;
  slot: MediaSlot;
  target: MediaTarget;
}>;
type MediaContainerResult = ReturnType<typeof mediaContainerDto>;

export async function attachMedia(actor: StorageActor, input: AttachMediaInput) {
  return attachOrReplace(actor, input, false);
}

export async function replaceSingletonMedia(actor: StorageActor, input: AttachMediaInput) {
  return attachOrReplace(actor, input, true);
}

async function attachOrReplace(actor: StorageActor, input: AttachMediaInput, replace: boolean) {
  validateMutationBase(input);
  if (!isUuid(input.assetId)) mediaError("VALIDATION_ERROR", "assetId must be a UUID.");
  const policy = mediaSlotPolicy(input.slot);
  if (replace && policy.collection) {
    mediaError("VALIDATION_ERROR", "Collection items must be detached and added explicitly.");
  }
  const productVariantId = input.productVariantId ?? null;
  if (productVariantId && (!policy.productVariantAllowed || !isUuid(productVariantId))) {
    mediaError("VALIDATION_ERROR", "productVariantId is invalid for this media slot.");
  }
  const altText = normalizeAltText(input.altText);
  const action: MediaMutationAction = replace ? "REPLACE_MEDIA" : "ATTACH_MEDIA";
  const requestHash = requestHashFor(actor, action, input, { altText, productVariantId });

  return mediaSerializable(async (transaction) => {
    const target = await resolveWritableMediaTarget(transaction, actor, input.target);
    await lockMutation(transaction, actor, input.idempotencyKey);
    const replay = await mutationReplay(transaction, actor, action, input.idempotencyKey, requestHash, target.organizationId);
    if (replay) return replay;
    await lockMediaScope(transaction, `media-target:${target.organizationId ?? actor.personId}:${targetKey(input.target)}`);
    let container = await findAndLockContainer(transaction, target.where);
    if (!container) {
      if (input.expectedVersion !== 0) mediaError("STALE_VERSION", "Media container version is stale.");
      container = await transaction.mediaContainer.create({ data: target.create });
    } else if (container.version !== input.expectedVersion) {
      mediaError("STALE_VERSION", "Media container version is stale.");
    }
    assertSlotKind(input.slot, container.kind, policy.containerKind);
    const asset = await lockAndValidateAsset(transaction, actor, input.assetId, input.slot);
    await assertProductVariant(transaction, container, productVariantId);
    const reused = await transaction.mediaBinding.findFirst({
      where: { assetId: asset.id, state: "ACTIVE" },
      select: { id: true },
    });
    if (reused) mediaError("MEDIA_SLOT_OCCUPIED", "Stored asset already has an active media binding.");

    const active = await activeBindings(transaction, container.id, input.slot);
    const now = await databaseNow(transaction);
    if (policy.collection) {
      if (active.length >= policy.maximumActiveItems) {
        mediaError("MEDIA_COLLECTION_LIMIT_REACHED", "Media collection reached its active item limit.");
      }
    } else if (active.length > 0 && !replace) {
      mediaError("MEDIA_SLOT_OCCUPIED", "Media slot already has an active binding.");
    } else if (replace && active.length === 0) {
      mediaError("MEDIA_BINDING_NOT_ACTIVE", "Media slot has no active binding to replace.");
    }
    if (replace) {
      const suspended = await transaction.mediaBinding.updateMany({
        where: { id: { in: active.map((binding) => binding.id) }, state: "ACTIVE" },
        data: {
          detachedAt: now,
          detachedByPersonId: actor.personId,
          state: "DETACHED",
          version: { increment: 1 },
        },
      });
      if (suspended.count !== active.length) {
        mediaError("STALE_VERSION", "Media singleton changed before replacement.");
      }
    }
    const sortOrder = policy.collection
      ? firstAvailableOrder(active.map((binding) => binding.sortOrder), policy.maximumActiveItems)
      : null;
    await transaction.mediaBinding.create({
      data: {
        altText,
        assetId: asset.id,
        containerId: container.id,
        createdByPersonId: actor.personId,
        productVariantId,
        slot: input.slot,
        sortOrder,
      },
    });
    container = await incrementContainerIfExisting(transaction, container, input.expectedVersion);
    const result = await currentContainerResult(transaction, container);
    await completeMutation(transaction, actor, {
      action,
      containerId: container.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      organizationId: target.organizationId,
      requestHash,
      result,
      resultVersion: container.version,
    });
    return result;
  });
}

export async function detachMedia(actor: StorageActor, input: BindingMutationInput) {
  validateBindingMutation(input);
  const action: MediaMutationAction = "DETACH_MEDIA";
  const requestHash = requestHashFor(actor, action, input);
  return mediaSerializable(async (transaction) => {
    const target = await resolveWritableMediaTarget(transaction, actor, input.target);
    await lockMutation(transaction, actor, input.idempotencyKey);
    const replay = await mutationReplay(transaction, actor, action, input.idempotencyKey, requestHash, target.organizationId);
    if (replay) return replay;
    await lockMediaScope(transaction, `media-target:${target.organizationId ?? actor.personId}:${targetKey(input.target)}`);
    const container = await requiredContainer(transaction, target.where, input.expectedVersion);
    assertSlotKind(input.slot, container.kind, mediaSlotPolicy(input.slot).containerKind);
    const binding = await lockActiveBinding(transaction, container.id, input.bindingId, input.slot);
    const now = await databaseNow(transaction);
    const changed = await transaction.mediaBinding.updateMany({
      where: { id: binding.id, state: "ACTIVE", version: binding.version },
      data: {
        detachedAt: now,
        detachedByPersonId: actor.personId,
        state: "DETACHED",
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) mediaError("MEDIA_BINDING_NOT_ACTIVE", "Media binding changed before detach.");
    const updatedContainer = await incrementRequiredContainer(transaction, container, input.expectedVersion);
    const result = await currentContainerResult(transaction, updatedContainer);
    await completeMutation(transaction, actor, {
      action,
      containerId: container.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      organizationId: target.organizationId,
      requestHash,
      result,
      resultVersion: updatedContainer.version,
    });
    return result;
  });
}

export async function reorderMedia(
  actor: StorageActor,
  input: Readonly<{
    bindingIds: readonly string[];
    expectedVersion: number;
    idempotencyKey: string;
    slot: MediaSlot;
    target: MediaTarget;
  }>,
) {
  validateMutationBase(input);
  const policy = mediaSlotPolicy(input.slot);
  if (!policy.collection || !Array.isArray(input.bindingIds)) {
    mediaError("VALIDATION_ERROR", "A collection slot and complete bindingIds array are required.");
  }
  if (input.bindingIds.length > policy.maximumActiveItems
    || input.bindingIds.some((id) => !isUuid(id))
    || new Set(input.bindingIds).size !== input.bindingIds.length) {
    mediaError("VALIDATION_ERROR", "bindingIds must be unique UUIDs within the collection limit.");
  }
  const action: MediaMutationAction = "REORDER_MEDIA";
  const requestHash = requestHashFor(actor, action, input, { bindingIds: input.bindingIds });
  return mediaSerializable(async (transaction) => {
    const target = await resolveWritableMediaTarget(transaction, actor, input.target);
    await lockMutation(transaction, actor, input.idempotencyKey);
    const replay = await mutationReplay(transaction, actor, action, input.idempotencyKey, requestHash, target.organizationId);
    if (replay) return replay;
    await lockMediaScope(transaction, `media-target:${target.organizationId ?? actor.personId}:${targetKey(input.target)}`);
    const container = await requiredContainer(transaction, target.where, input.expectedVersion);
    assertSlotKind(input.slot, container.kind, policy.containerKind);
    const active = await activeBindings(transaction, container.id, input.slot);
    const activeIds = active.map((binding) => binding.id).sort();
    if (activeIds.length !== input.bindingIds.length
      || activeIds.some((id, index) => id !== [...input.bindingIds].sort()[index])) {
      mediaError("VALIDATION_ERROR", "Reorder must contain the exact complete active binding set.");
    }
    if (input.bindingIds.length > 0) {
      // PostgreSQL enforces partial unique indexes row-by-row, so an in-place
      // swap (0 <-> 1) can collide even when one UPDATE contains both rows.
      // Remove the complete, locked set from the active-order index first;
      // both statements remain invisible outside this transaction.
      const suspended = await transaction.mediaBinding.updateMany({
        where: {
          containerId: container.id,
          id: { in: [...input.bindingIds] },
          slot: input.slot,
          state: "ACTIVE",
        },
        data: {
          detachedAt: await databaseNow(transaction),
          detachedByPersonId: actor.personId,
          state: "DETACHED",
        },
      });
      if (suspended.count !== input.bindingIds.length) {
        mediaError("STALE_VERSION", "Media collection changed before reorder.");
      }
      const rows = input.bindingIds.map((id, index) => Prisma.sql`(${id}::uuid, ${index}::integer)`);
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "MediaBinding" AS binding
        SET "sortOrder" = requested."sortOrder",
            "state" = 'ACTIVE',
            "detachedAt" = NULL,
            "detachedByPersonId" = NULL,
            "version" = binding."version" + 1,
            "updatedAt" = clock_timestamp()
        FROM (VALUES ${Prisma.join(rows)}) AS requested("id", "sortOrder")
        WHERE binding."id" = requested."id"
          AND binding."containerId" = ${container.id}::uuid
          AND binding."slot" = ${input.slot}::"MediaSlot"
          AND binding."state" = 'DETACHED'
      `);
    }
    const updatedContainer = await incrementRequiredContainer(transaction, container, input.expectedVersion);
    const result = await currentContainerResult(transaction, updatedContainer);
    await completeMutation(transaction, actor, {
      action,
      containerId: container.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      organizationId: target.organizationId,
      requestHash,
      result,
      resultVersion: updatedContainer.version,
    });
    return result;
  });
}

export async function updateMediaAltText(
  actor: StorageActor,
  input: BindingMutationInput & Readonly<{ altText: unknown }>,
) {
  validateBindingMutation(input);
  const altText = normalizeAltText(input.altText);
  const action: MediaMutationAction = "UPDATE_MEDIA_ALT";
  const requestHash = requestHashFor(actor, action, input, { altText });
  return mediaSerializable(async (transaction) => {
    const target = await resolveWritableMediaTarget(transaction, actor, input.target);
    await lockMutation(transaction, actor, input.idempotencyKey);
    const replay = await mutationReplay(transaction, actor, action, input.idempotencyKey, requestHash, target.organizationId);
    if (replay) return replay;
    await lockMediaScope(transaction, `media-target:${target.organizationId ?? actor.personId}:${targetKey(input.target)}`);
    const container = await requiredContainer(transaction, target.where, input.expectedVersion);
    assertSlotKind(input.slot, container.kind, mediaSlotPolicy(input.slot).containerKind);
    const binding = await lockActiveBinding(transaction, container.id, input.bindingId, input.slot);
    const changed = await transaction.mediaBinding.updateMany({
      where: { id: binding.id, state: "ACTIVE", version: binding.version },
      data: { altText, version: { increment: 1 } },
    });
    if (changed.count !== 1) mediaError("MEDIA_BINDING_NOT_ACTIVE", "Media binding changed before alt-text update.");
    const updatedContainer = await incrementRequiredContainer(transaction, container, input.expectedVersion);
    const result = await currentContainerResult(transaction, updatedContainer);
    await completeMutation(transaction, actor, {
      action,
      containerId: container.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      organizationId: target.organizationId,
      requestHash,
      result,
      resultVersion: updatedContainer.version,
    });
    return result;
  });
}

async function lockAndValidateAsset(
  transaction: Prisma.TransactionClient,
  actor: StorageActor,
  assetId: string,
  slot: MediaSlot,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "StoredAsset" WHERE "id" = ${assetId}::uuid FOR UPDATE`,
  );
  const asset = await transaction.storedAsset.findUnique({ where: { id: assetId } });
  if (!asset) mediaError("NOT_FOUND", "Stored asset was not found.");
  const policy = mediaSlotPolicy(slot);
  if (asset.purpose !== policy.purpose) {
    mediaError("MEDIA_PURPOSE_MISMATCH", "Stored asset purpose does not match the media slot.");
  }
  if (asset.state !== "READY") mediaError("ASSET_NOT_READY", "Stored asset is not ready.");
  const purposePolicy = storagePurposePolicy(asset.purpose);
  if (asset.visibility !== purposePolicy.visibility
    || purposePolicy.publicDeliveryPermitted !== policy.publicDeliveryAllowed) {
    mediaError("MEDIA_PURPOSE_MISMATCH", "Stored asset visibility does not match the media slot.");
  }
  if (actor.kind === "customer") {
    if (asset.ownerPersonId !== actor.personId || asset.organizationId !== null) {
      mediaError("NOT_FOUND", "Stored asset was not found.");
    }
  } else if (asset.organizationId !== actor.organizationId || asset.ownerPersonId !== null) {
    mediaError("NOT_FOUND", "Stored asset was not found.");
  }
  return asset;
}

async function activeBindings(transaction: Prisma.TransactionClient, containerId: string, slot: MediaSlot) {
  return transaction.mediaBinding.findMany({
    where: { containerId, slot, state: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

async function lockActiveBinding(
  transaction: Prisma.TransactionClient,
  containerId: string,
  bindingId: string,
  slot: MediaSlot,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "MediaBinding"
    WHERE "id" = ${bindingId}::uuid AND "containerId" = ${containerId}::uuid
    FOR UPDATE
  `);
  const binding = await transaction.mediaBinding.findFirst({
    where: { id: bindingId, containerId, slot, state: "ACTIVE" },
  });
  if (!binding) mediaError("MEDIA_BINDING_NOT_ACTIVE", "Active media binding was not found.");
  return binding;
}

async function requiredContainer(
  transaction: Prisma.TransactionClient,
  where: Prisma.MediaContainerWhereInput,
  expectedVersion: number,
) {
  const container = await findAndLockContainer(transaction, where);
  if (!container || container.version !== expectedVersion) {
    mediaError("STALE_VERSION", "Media container version is stale.");
  }
  return container;
}

async function incrementContainerIfExisting(
  transaction: Prisma.TransactionClient,
  container: MediaContainer,
  expectedVersion: number,
) {
  if (expectedVersion === 0) return container;
  return incrementRequiredContainer(transaction, container, expectedVersion);
}

async function incrementRequiredContainer(
  transaction: Prisma.TransactionClient,
  container: MediaContainer,
  expectedVersion: number,
) {
  const changed = await transaction.mediaContainer.updateMany({
    where: { id: container.id, version: expectedVersion },
    data: { version: { increment: 1 } },
  });
  if (changed.count !== 1) mediaError("STALE_VERSION", "Media container changed before mutation.");
  return transaction.mediaContainer.findUniqueOrThrow({ where: { id: container.id } });
}

async function currentContainerResult(transaction: Prisma.TransactionClient, container: MediaContainer) {
  const bindings = await transaction.mediaBinding.findMany({
    where: { containerId: container.id, state: "ACTIVE" },
    include: { asset: true },
    orderBy: [{ slot: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return mediaContainerDto(container, bindings);
}

async function lockMutation(transaction: Prisma.TransactionClient, actor: StorageActor, idempotencyKey: string) {
  await lockMediaScope(transaction, `media-mutation:${actor.personId}:${idempotencyKey}`);
}

async function mutationReplay(
  transaction: Prisma.TransactionClient,
  actor: StorageActor,
  action: MediaMutationAction,
  idempotencyKey: string,
  requestHash: string,
  organizationId: string | null,
): Promise<MediaContainerResult | null> {
  const existing = await transaction.mediaMutation.findUnique({
    where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.action !== action
    || existing.requestHash !== requestHash
    || existing.organizationId !== organizationId) {
    mediaError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different media request.");
  }
  if (existing.status !== "COMPLETED" || !existing.result) {
    mediaError("STORAGE_PROVIDER_FAILURE", "Media mutation is not safely replayable.");
  }
  return existing.result as unknown as MediaContainerResult;
}

async function completeMutation(
  transaction: Prisma.TransactionClient,
  actor: StorageActor,
  input: {
    action: MediaMutationAction;
    containerId: string;
    expectedVersion: number;
    idempotencyKey: string;
    organizationId: string | null;
    requestHash: string;
    result: ReturnType<typeof mediaContainerDto>;
    resultVersion: number;
  },
) {
  await transaction.mediaMutation.create({
    data: {
      action: input.action,
      actorPersonId: actor.personId,
      containerId: input.containerId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      organizationId: input.organizationId,
      requestHash: input.requestHash,
      result: input.result,
      resultVersion: input.resultVersion,
      status: "COMPLETED",
    },
  });
}

function requestHashFor(
  actor: StorageActor,
  action: MediaMutationAction,
  input: { expectedVersion: number; idempotencyKey: string; slot: MediaSlot; target: MediaTarget },
  extra: Record<string, unknown> = {},
) {
  return mediaRequestHash({
    action,
    actor: actor.kind === "customer"
      ? { kind: actor.kind, personId: actor.personId }
      : {
          kind: actor.kind,
          membershipId: actor.membershipId,
          organizationId: actor.organizationId,
          personId: actor.personId,
          roleId: actor.roleId,
        },
    expectedVersion: input.expectedVersion,
    slot: input.slot,
    target: input.target,
    ...("assetId" in input ? { assetId: input.assetId } : {}),
    ...("bindingId" in input ? { bindingId: input.bindingId } : {}),
    ...extra,
  });
}

function validateMutationBase(input: { expectedVersion: number; idempotencyKey: string; slot: MediaSlot }) {
  if (!isUuid(input.idempotencyKey)
    || !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 0) {
    mediaError("VALIDATION_ERROR", "idempotencyKey and expectedVersion are invalid.");
  }
  mediaSlotPolicy(input.slot);
}

function validateBindingMutation(input: BindingMutationInput) {
  validateMutationBase(input);
  if (!isUuid(input.bindingId)) mediaError("VALIDATION_ERROR", "bindingId must be a UUID.");
  if (input.expectedVersion < 1) mediaError("VALIDATION_ERROR", "expectedVersion must be positive.");
}

function firstAvailableOrder(values: Array<number | null>, maximum: number) {
  const used = new Set(values.filter((value): value is number => value !== null));
  for (let value = 0; value < maximum; value += 1) if (!used.has(value)) return value;
  mediaError("MEDIA_COLLECTION_LIMIT_REACHED", "Media collection has no available order.");
}

export type MediaLifecycleResult = Awaited<ReturnType<typeof attachMedia>>;
export type MediaBindingWithAsset = MediaBinding & { asset: StoredAsset };
