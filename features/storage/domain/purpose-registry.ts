import type { StoragePurpose, StorageVisibility, SystemRole } from "@prisma/client";

export const STORAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type StorageMimeType = (typeof STORAGE_MIME_TYPES)[number];
export type StorageOwnerFamily = "PERSON" | "ORGANIZATION" | "PLATFORM_INTERNAL";

export type StoragePurposePolicy = Readonly<{
  allowedMimeTypes: readonly StorageMimeType[];
  inspectionRequired: true;
  laterOwner: "GATE_5A" | "GATE_5B";
  /** Compatibility name: enforced against provider-resident assets plus active same-purpose reservations. */
  maxActiveAssets: number;
  maxBytes: number;
  ownerFamily: StorageOwnerFamily;
  publicDeliveryPermitted: boolean;
  visibility: StorageVisibility;
}>;

const MIB = 1024 * 1024;
const staticRaster = STORAGE_MIME_TYPES;

export const STORAGE_PURPOSE_REGISTRY: Readonly<Record<StoragePurpose, StoragePurposePolicy>> = {
  CUSTOMER_AVATAR: policy("PERSON", "PRIVATE", 5 * MIB, 5),
  BUSINESS_LOGO: policy("ORGANIZATION", "PUBLIC", 5 * MIB, 5),
  BUSINESS_COVER: policy("ORGANIZATION", "PUBLIC", 10 * MIB, 5),
  BUSINESS_GALLERY_IMAGE: policy("ORGANIZATION", "PUBLIC", 10 * MIB, 24),
  SERVICE_IMAGE: policy("ORGANIZATION", "PUBLIC", 10 * MIB, 50),
  STORE_LOGO: policy("ORGANIZATION", "PUBLIC", 5 * MIB, 5),
  STORE_COVER: policy("ORGANIZATION", "PUBLIC", 10 * MIB, 5),
  PRODUCT_IMAGE: policy("ORGANIZATION", "PUBLIC", 10 * MIB, 120),
  RESTAURANT_MENU_IMAGE: policy("ORGANIZATION", "PUBLIC", 10 * MIB, 120),
  INTERNAL_STORAGE_TEST: {
    ...policy("PLATFORM_INTERNAL", "INTERNAL", MIB, 50),
    laterOwner: "GATE_5A",
  },
};

function policy(
  ownerFamily: StorageOwnerFamily,
  visibility: StorageVisibility,
  maxBytes: number,
  maxActiveAssets: number,
): StoragePurposePolicy {
  return {
    allowedMimeTypes: staticRaster,
    inspectionRequired: true,
    laterOwner: "GATE_5B",
    maxActiveAssets,
    maxBytes,
    ownerFamily,
    publicDeliveryPermitted: visibility === "PUBLIC",
    visibility,
  };
}

export function storagePurposePolicy(purpose: StoragePurpose) {
  return STORAGE_PURPOSE_REGISTRY[purpose];
}

export function isStoragePurpose(value: unknown): value is StoragePurpose {
  return typeof value === "string" && Object.hasOwn(STORAGE_PURPOSE_REGISTRY, value);
}

export function isStorageMimeType(value: unknown): value is StorageMimeType {
  return typeof value === "string"
    && STORAGE_MIME_TYPES.includes(value as StorageMimeType);
}

export function canManageOrganizationStorage(role: SystemRole | null) {
  return role === "OWNER" || role === "MANAGER";
}
