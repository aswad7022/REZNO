import { createHash } from "node:crypto";

import type { MediaContainerKind, MediaSlot } from "@prisma/client";

import { mediaError } from "@/features/media/domain/errors";

export const MEDIA_JSON_BODY_MAX_BYTES = 32 * 1024;

export type MediaTarget =
  | Readonly<{ kind: "CUSTOMER_PROFILE" }>
  | Readonly<{ kind: "BUSINESS_PROFILE" }>
  | Readonly<{ kind: "SERVICE"; serviceId: string }>
  | Readonly<{ kind: "STORE"; storeId: string }>
  | Readonly<{ kind: "PRODUCT"; productId: string }>
  | Readonly<{ kind: "MENU_ITEM"; menuItemId: string }>;

export function normalizeAltText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") mediaError("VALIDATION_ERROR", "altText must be text or null.");
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/gu, "").trim();
  if (normalized.length > 300) mediaError("VALIDATION_ERROR", "altText must not exceed 300 characters.");
  if (/[<>]/u.test(normalized)) mediaError("VALIDATION_ERROR", "altText must be plain text without HTML.");
  return normalized || null;
}

export function mediaRequestHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function targetLockKey(actorPersonId: string, organizationId: string | null, target: MediaTarget) {
  return `media-target:${actorPersonId}:${organizationId ?? "customer"}:${targetKey(target)}`;
}

export function targetKey(target: MediaTarget) {
  switch (target.kind) {
    case "CUSTOMER_PROFILE": return "customer-profile";
    case "BUSINESS_PROFILE": return "business-profile";
    case "SERVICE": return `service:${target.serviceId}`;
    case "STORE": return `store:${target.storeId}`;
    case "PRODUCT": return `product:${target.productId}`;
    case "MENU_ITEM": return `menu-item:${target.menuItemId}`;
  }
}

export function targetKind(target: MediaTarget): MediaContainerKind {
  return target.kind;
}

export function assertSlotKind(slot: MediaSlot, actual: MediaContainerKind, expected: MediaContainerKind) {
  if (actual !== expected) mediaError("VALIDATION_ERROR", `Slot ${slot} is not legal for ${actual}.`);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}
