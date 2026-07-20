import "server-only";

import { Prisma, type MediaBinding, type MediaContainer, type MediaSlot, type StoredAsset } from "@prisma/client";

import {
  legacyMediaReference,
  managedMediaReference,
  mediaContainerDto,
  type MediaReferenceDto,
} from "@/features/media/domain/contracts";
import { safeLegacyMediaReference } from "@/features/media/domain/legacy";
import type { MediaTarget } from "@/features/media/domain/policy";
import { mediaSlotPolicy } from "@/features/media/domain/slot-registry";
import type { StorageActor } from "@/features/storage/services/actor";
import { prisma } from "@/lib/db/prisma";
import { findAndLockContainer, resolveWritableMediaTarget } from "@/features/media/services/targets";
import { mediaSerializable } from "@/features/media/services/transaction";

type BindingWithAsset = MediaBinding & { asset: StoredAsset };
const PUBLIC_MEDIA_BATCH_MAX_TARGETS = 500;

export async function getMediaContainer(actor: StorageActor, target: MediaTarget) {
  return mediaSerializable(async (transaction) => {
    const resolved = await resolveWritableMediaTarget(transaction, actor, target);
    const container = await findAndLockContainer(transaction, resolved.where);
    if (!container) return mediaContainerDto(null, []);
    const bindings = await transaction.mediaBinding.findMany({
      where: { containerId: container.id, state: "ACTIVE" },
      include: { asset: true },
      orderBy: [{ slot: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    return mediaContainerDto(container, bindings);
  });
}

export function resolveMediaFallback(
  slot: MediaSlot,
  bindings: readonly BindingWithAsset[],
  legacyValues: readonly unknown[],
  canonicalHistoryExists = bindings.length > 0,
): MediaReferenceDto[] {
  if (canonicalHistoryExists) {
    return bindings
      .filter((binding) => binding.state === "ACTIVE"
        && binding.asset.state === "READY"
        && binding.asset.purpose === mediaSlotPolicy(slot).purpose
        && binding.slot === slot)
      .sort(bindingOrder)
      .map((binding) => managedMediaReference(binding, binding.asset));
  }
  return legacyValues.flatMap((value, index) => {
    const safe = safeLegacyMediaReference(value);
    return safe ? [legacyMediaReference(slot, safe, { sortOrder: mediaSlotPolicy(slot).collection ? index : null })] : [];
  });
}

export type PublicMediaBatchTarget = Readonly<{
  id: string;
  kind: "BUSINESS_PROFILE" | "SERVICE" | "STORE" | "PRODUCT" | "MENU_ITEM";
  legacyValues?: readonly unknown[];
  slot: MediaSlot;
}>;

/** One bounded container/binding query for list and detail projections. Callers supply only already-authorized public targets. */
export async function resolvePublicMediaBatch(inputs: readonly PublicMediaBatchTarget[]) {
  return resolvePublicMediaBatchWithClient(prisma, inputs);
}

export async function resolvePublicMediaBatchWithClient(
  client: Pick<Prisma.TransactionClient, "mediaBinding" | "mediaContainer">,
  inputs: readonly PublicMediaBatchTarget[],
) {
  if (inputs.length === 0) return new Map<string, MediaReferenceDto[]>();
  if (inputs.length > PUBLIC_MEDIA_BATCH_MAX_TARGETS) {
    throw new Error(`Public media batches are limited to ${PUBLIC_MEDIA_BATCH_MAX_TARGETS} targets.`);
  }
  const containers = await client.mediaContainer.findMany({
    where: { OR: inputs.map(targetWhere) },
  });
  const containerIds = containers.map((container) => container.id);
  const slots = [...new Set(inputs.map((input) => input.slot))];
  const activeBindings = containerIds.length === 0 ? [] : await client.mediaBinding.findMany({
    where: { containerId: { in: containerIds }, slot: { in: slots }, state: "ACTIVE" },
    include: { asset: true },
    orderBy: [{ containerId: "asc" }, { slot: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const historyMarkers = containerIds.length === 0 ? [] : await client.mediaBinding.findMany({
    where: { containerId: { in: containerIds }, slot: { in: slots } },
    distinct: ["containerId", "slot"],
    select: { containerId: true, slot: true },
  });
  const byTarget = new Map(containers.map((container) => [containerKey(container), container]));
  const activeBySlot = Map.groupBy(activeBindings, (binding) => `${binding.containerId}:${binding.slot}`);
  const historyBySlot = new Set(historyMarkers.map((binding) => `${binding.containerId}:${binding.slot}`));
  return new Map(inputs.map((input) => {
    const targetKey = `${input.kind}:${input.id}`;
    const key = `${targetKey}:${input.slot}`;
    const container = byTarget.get(targetKey);
    const containerSlot = container ? `${container.id}:${input.slot}` : null;
    const active = containerSlot ? activeBySlot.get(containerSlot) ?? [] : [];
    return [key, resolveMediaFallback(
      input.slot,
      active,
      input.legacyValues ?? [],
      containerSlot ? historyBySlot.has(containerSlot) : false,
    )];
  }));
}

function targetWhere(input: PublicMediaBatchTarget): Prisma.MediaContainerWhereInput {
  switch (input.kind) {
    case "BUSINESS_PROFILE": return { kind: input.kind, organizationId: input.id };
    case "SERVICE": return { kind: input.kind, serviceId: input.id };
    case "STORE": return { kind: input.kind, storeId: input.id };
    case "PRODUCT": return { kind: input.kind, productId: input.id };
    case "MENU_ITEM": return { kind: input.kind, menuItemId: input.id };
  }
}

function containerKey(container: MediaContainer) {
  switch (container.kind) {
    case "CUSTOMER_PROFILE": return `${container.kind}:${container.personId}`;
    case "BUSINESS_PROFILE": return `${container.kind}:${container.organizationId}`;
    case "SERVICE": return `${container.kind}:${container.serviceId}`;
    case "STORE": return `${container.kind}:${container.storeId}`;
    case "PRODUCT": return `${container.kind}:${container.productId}`;
    case "MENU_ITEM": return `${container.kind}:${container.menuItemId}`;
  }
}

function bindingOrder(left: BindingWithAsset, right: BindingWithAsset) {
  return (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id);
}
