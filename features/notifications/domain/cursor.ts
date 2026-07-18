import { createHash } from "node:crypto";

import type { NotificationActorContext } from "@/features/notifications/domain/contracts";
import { notificationRequestHash, notificationScopeKey } from "@/features/notifications/domain/contracts";
import { notificationError } from "@/features/notifications/domain/errors";

interface NotificationCursorCore {
  filter: string;
  id: string;
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
}

type NotificationCursorEnvelope = NotificationCursorCore & { checksum: string; version: 1 };

export function notificationFilterFingerprint(value: unknown) {
  return notificationRequestHash(value);
}

export function encodeNotificationCursor(value: NotificationCursorCore) {
  return Buffer.from(JSON.stringify({ ...value, checksum: checksum(value), version: 1 }), "utf8").toString("base64url");
}

export function decodeNotificationCursor(
  encoded: string,
  expected: { context: NotificationActorContext; filter: string; pageSize: number },
) {
  if (!encoded || encoded.length > 3_000) invalid();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(decoded)) invalid();
  const core: NotificationCursorCore = {
    filter: decoded.filter,
    id: decoded.id,
    pageSize: decoded.pageSize,
    scope: decoded.scope,
    snapshot: decoded.snapshot,
    sortValue: decoded.sortValue,
  };
  if (
    decoded.checksum !== checksum(core) ||
    core.filter !== expected.filter ||
    core.pageSize !== expected.pageSize ||
    core.scope !== notificationScopeKey(expected.context)
  ) invalid();
  return { ...core, snapshotDate: exactDate(core.snapshot), sortDate: exactDate(core.sortValue) };
}

function checksum(value: NotificationCursorCore) {
  return createHash("sha256").update(`rezno-notification-cursor:${JSON.stringify(value)}`).digest("hex");
}

function isEnvelope(value: unknown): value is NotificationCursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 &&
    typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter) &&
    typeof item.id === "string" && /^[0-9a-f-]{36}$/i.test(item.id) &&
    typeof item.pageSize === "number" && Number.isInteger(item.pageSize) && item.pageSize > 0 && item.pageSize <= 50 &&
    typeof item.scope === "string" && item.scope.length <= 180 &&
    typeof item.snapshot === "string" && typeof item.sortValue === "string" &&
    typeof item.checksum === "string" && /^[a-f0-9]{64}$/.test(item.checksum);
}

function exactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) invalid();
  return date;
}

function invalid(): never {
  return notificationError("INVALID_CURSOR", "Notification cursor is invalid for this inbox scope.");
}
