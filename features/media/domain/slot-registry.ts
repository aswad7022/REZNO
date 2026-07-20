import "server-only";

import type { MediaContainerKind, MediaSlot, StoragePurpose } from "@prisma/client";

export type MediaSlotPolicy = Readonly<{
  altTextRequired: boolean;
  collection: boolean;
  containerKind: MediaContainerKind;
  legacyField: string;
  maximumActiveItems: number;
  productVariantAllowed: boolean;
  publicDeliveryAllowed: boolean;
  purpose: StoragePurpose;
  surfaces: readonly string[];
}>;

export const MEDIA_SLOT_REGISTRY: Readonly<Record<MediaSlot, MediaSlotPolicy>> = {
  CUSTOMER_AVATAR: slot("CUSTOMER_PROFILE", "CUSTOMER_AVATAR", false, 1, false, false, "Person.avatarUrl", ["Customer Web", "Customer Mobile"]),
  BUSINESS_LOGO: slot("BUSINESS_PROFILE", "BUSINESS_LOGO", false, 1, false, true, "BusinessProfile.logoUrl", ["Business Web", "public Business"]),
  BUSINESS_COVER: slot("BUSINESS_PROFILE", "BUSINESS_COVER", false, 1, false, true, "BusinessProfile.coverImageUrl", ["Business Web", "public Business"]),
  BUSINESS_GALLERY: slot("BUSINESS_PROFILE", "BUSINESS_GALLERY_IMAGE", true, 24, false, true, "BusinessProfile.galleryUrls", ["Business Web", "public Business"]),
  SERVICE_PRIMARY: slot("SERVICE", "SERVICE_IMAGE", false, 1, false, true, "Service.imageUrl", ["Business Web", "booking", "search"]),
  STORE_LOGO: slot("STORE", "STORE_LOGO", false, 1, false, true, "Store.logoUrl", ["Business Web", "marketplace"]),
  STORE_COVER: slot("STORE", "STORE_COVER", false, 1, false, true, "Store.coverImageUrl", ["Business Web", "marketplace"]),
  PRODUCT_IMAGE: slot("PRODUCT", "PRODUCT_IMAGE", true, 12, true, true, "ProductMedia.url", ["Business Web", "marketplace", "orders"]),
  MENU_ITEM_PRIMARY: slot("MENU_ITEM", "RESTAURANT_MENU_IMAGE", false, 1, false, true, "MenuItem.imageUrl", ["Business Web", "restaurant menu"]),
};

function slot(
  containerKind: MediaContainerKind,
  purpose: StoragePurpose,
  collection: boolean,
  maximumActiveItems: number,
  productVariantAllowed: boolean,
  publicDeliveryAllowed: boolean,
  legacyField: string,
  surfaces: readonly string[],
): MediaSlotPolicy {
  return {
    altTextRequired: false,
    collection,
    containerKind,
    legacyField,
    maximumActiveItems,
    productVariantAllowed,
    publicDeliveryAllowed,
    purpose,
    surfaces,
  };
}

export function mediaSlotPolicy(slotValue: MediaSlot) {
  return MEDIA_SLOT_REGISTRY[slotValue];
}

export function isMediaSlot(value: unknown): value is MediaSlot {
  return typeof value === "string" && Object.hasOwn(MEDIA_SLOT_REGISTRY, value);
}

export const MEDIA_GATE_EXCLUSIONS = Object.freeze([
  "PAYMENTS",
  "MESSAGE_ATTACHMENTS",
  "REVIEW_ATTACHMENTS",
  "VIDEO",
  "AUDIO",
  "DOCUMENTS",
  "REMOTE_IMPORT",
  "AUTOMATIC_CLEANUP",
] as const);
