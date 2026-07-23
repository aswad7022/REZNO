import type { MediaRenditionProfile, MediaSlot } from "@prisma/client";

import { storageRequestHash, storageRuntimeEnvironment } from "@/features/storage/domain/policy";

export type MediaRenditionPolicy = Readonly<{
  effort: 4;
  format: "image/webp";
  maxBytes: number;
  maxHeight: number;
  maxWidth: number;
  quality: number;
}>;

export const MEDIA_RENDITION_PROFILES: Readonly<Record<MediaRenditionProfile, MediaRenditionPolicy>> = {
  AVATAR_256_WEBP: profile(256, 256, 512 * 1024, 82),
  CARD_640_WEBP: profile(640, 640, 1024 * 1024, 82),
  HERO_1600_WEBP: profile(1_600, 1_600, 4 * 1024 * 1024, 84),
};

const SLOT_PROFILE: Readonly<Record<MediaSlot, MediaRenditionProfile>> = {
  CUSTOMER_AVATAR: "AVATAR_256_WEBP",
  BUSINESS_LOGO: "CARD_640_WEBP",
  BUSINESS_COVER: "HERO_1600_WEBP",
  BUSINESS_GALLERY: "HERO_1600_WEBP",
  SERVICE_PRIMARY: "CARD_640_WEBP",
  STORE_LOGO: "CARD_640_WEBP",
  STORE_COVER: "HERO_1600_WEBP",
  PRODUCT_IMAGE: "HERO_1600_WEBP",
  MENU_ITEM_PRIMARY: "CARD_640_WEBP",
};

export function mediaRenditionPolicy(profileValue: MediaRenditionProfile) {
  return MEDIA_RENDITION_PROFILES[profileValue];
}

export function mediaRenditionProfileForSlot(slot: MediaSlot) {
  return SLOT_PROFILE[slot];
}

export function isMediaRenditionProfile(value: unknown): value is MediaRenditionProfile {
  return typeof value === "string" && Object.hasOwn(MEDIA_RENDITION_PROFILES, value);
}

export function mediaRenditionSourceFingerprint(input: {
  profile: MediaRenditionProfile;
  sourceAssetId: string;
  sourceAssetVersion: number;
  sourceChecksumSha256: string;
  sourceProviderObjectVersion: string | null;
}) {
  return storageRequestHash(input);
}

export function generateMediaRenditionObjectKey(sourceAssetId: string, sourceFingerprint: string) {
  const objectId = uuidFromFingerprint(sourceFingerprint);
  return `${storageRuntimeEnvironment()}/media-rendition/${sourceAssetId.toLowerCase()}/${objectId}`;
}

function uuidFromFingerprint(fingerprint: string) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Rendition fingerprint must be SHA-256 hex.");
  const value = fingerprint.slice(0, 32).split("");
  value[12] = "5";
  value[16] = ["8", "9", "a", "b"][Number.parseInt(value[16]!, 16) % 4]!;
  const hex = value.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function profile(maxWidth: number, maxHeight: number, maxBytes: number, quality: number): MediaRenditionPolicy {
  return { effort: 4, format: "image/webp", maxBytes, maxHeight, maxWidth, quality };
}
