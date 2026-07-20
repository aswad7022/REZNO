import type {
  MediaBinding,
  MediaContainer,
  MediaSlot,
  StoredAsset,
} from "@prisma/client";

import { mediaSlotPolicy } from "@/features/media/domain/slot-registry";

export type MediaReferenceDto = Readonly<{
  altText: string | null;
  assetId: string | null;
  height: number | null;
  mimeType: string | null;
  sortOrder: number | null;
  source: "MANAGED_ASSET" | "LEGACY_URL";
  stableDeliveryPath: string;
  slot: MediaSlot;
  type: "MEDIA_REFERENCE";
  variantId: string | null;
  width: number | null;
}>;

export function managedMediaReference(
  binding: MediaBinding,
  asset: StoredAsset,
): MediaReferenceDto {
  const metadata = safeDimensions(asset.inspectionMetadata);
  const publicDelivery = mediaSlotPolicy(binding.slot).publicDeliveryAllowed;
  return {
    type: "MEDIA_REFERENCE",
    altText: binding.altText,
    assetId: asset.id,
    height: metadata.height,
    mimeType: asset.mimeType,
    sortOrder: binding.sortOrder,
    source: "MANAGED_ASSET",
    stableDeliveryPath: publicDelivery
      ? `/media/${asset.id}`
      : `/api/media/customer/assets/${asset.id}`,
    slot: binding.slot,
    variantId: binding.productVariantId,
    width: metadata.width,
  };
}

export function legacyMediaReference(
  slot: MediaSlot,
  stableDeliveryPath: string,
  options: { altText?: string | null; sortOrder?: number | null; variantId?: string | null } = {},
): MediaReferenceDto {
  return {
    type: "MEDIA_REFERENCE",
    altText: options.altText ?? null,
    assetId: null,
    height: null,
    mimeType: null,
    sortOrder: options.sortOrder ?? null,
    source: "LEGACY_URL",
    stableDeliveryPath,
    slot,
    variantId: options.variantId ?? null,
    width: null,
  };
}

export function mediaBindingDto(binding: MediaBinding, asset: StoredAsset) {
  return {
    type: "MEDIA_BINDING" as const,
    id: binding.id,
    state: binding.state,
    slot: binding.slot,
    sortOrder: binding.sortOrder,
    variantId: binding.productVariantId,
    altText: binding.altText,
    version: binding.version,
    attachedAt: binding.attachedAt.toISOString(),
    detachedAt: binding.detachedAt?.toISOString() ?? null,
    media: binding.state === "ACTIVE" && asset.state === "READY"
      ? managedMediaReference(binding, asset)
      : null,
  };
}

export function mediaContainerDto(
  container: Pick<MediaContainer, "id" | "kind" | "version" | "updatedAt"> | null,
  bindings: Array<MediaBinding & { asset: StoredAsset }>,
) {
  return {
    type: "MEDIA_CONTAINER" as const,
    id: container?.id ?? null,
    kind: container?.kind ?? null,
    version: container?.version ?? 0,
    updatedAt: container?.updatedAt.toISOString() ?? null,
    bindings: bindings.map((binding) => mediaBindingDto(binding, binding.asset)),
  };
}

function safeDimensions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { height: null, width: null };
  const metadata = value as Record<string, unknown>;
  return {
    height: Number.isInteger(metadata.height) && Number(metadata.height) > 0 ? Number(metadata.height) : null,
    width: Number.isInteger(metadata.width) && Number(metadata.width) > 0 ? Number(metadata.width) : null,
  };
}
