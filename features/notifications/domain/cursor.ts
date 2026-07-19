import "server-only";

import type { NotificationActorContext } from "@/features/notifications/domain/contracts";
import { notificationRequestHash, notificationScopeKey } from "@/features/notifications/domain/contracts";
import { notificationError } from "@/features/notifications/domain/errors";
import {
  signNotificationCursor,
  verifyNotificationCursorMac,
} from "@/features/notifications/domain/cursor-signing";
import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "@/lib/db/postgres-timestamp";

export const NOTIFICATION_CURSOR_ENVELOPE_VERSION = 3;
export const NOTIFICATION_CURSOR_MAX_LENGTH = 3_000;

interface NotificationCursorCore {
  version: typeof NOTIFICATION_CURSOR_ENVELOPE_VERSION;
  kind: "NOTIFICATION_CURSOR";
  filter: string;
  id: string;
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
}

type NotificationCursorEnvelope = NotificationCursorCore & { mac: string };
type NotificationCursorValue = Omit<NotificationCursorCore, "kind" | "version">;

export function notificationFilterFingerprint(value: unknown) {
  return notificationRequestHash(value);
}

export function encodeNotificationCursor(value: NotificationCursorValue) {
  const snapshot = parseExactPostgresTimestamp(value.snapshot);
  const sortValue = parseExactPostgresTimestamp(value.sortValue);
  if (
    !snapshot
    || !sortValue
    || compareExactPostgresTimestamps(sortValue, snapshot) > 0
  ) invalid();
  const core: NotificationCursorCore = {
    version: NOTIFICATION_CURSOR_ENVELOPE_VERSION,
    kind: "NOTIFICATION_CURSOR",
    filter: value.filter,
    id: value.id,
    pageSize: value.pageSize,
    scope: value.scope,
    snapshot,
    sortValue,
  };
  let mac: string;
  try {
    mac = signNotificationCursor(canonicalMacInput(core)).toString("hex");
  } catch {
    invalid();
  }
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString("base64url");
}

export function decodeNotificationCursor(
  encoded: string,
  expected: { context: NotificationActorContext; filter: string; pageSize: number },
  authoritativeNow: string,
) {
  if (
    !encoded
    || encoded.length > NOTIFICATION_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) invalid();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(decoded)) invalid();
  const core: NotificationCursorCore = {
    version: decoded.version,
    kind: decoded.kind,
    filter: decoded.filter,
    id: decoded.id,
    pageSize: decoded.pageSize,
    scope: decoded.scope,
    snapshot: decoded.snapshot,
    sortValue: decoded.sortValue,
  };
  let authenticated = false;
  try {
    authenticated = verifyNotificationCursorMac(canonicalMacInput(core), decoded.mac);
  } catch {
    invalid();
  }
  if (!authenticated) invalid();
  if (
    core.filter !== expected.filter
    || core.pageSize !== expected.pageSize
    || core.scope !== notificationScopeKey(expected.context)
  ) invalid();
  const snapshotTimestamp = parseExactPostgresTimestamp(core.snapshot);
  const sortTimestamp = parseExactPostgresTimestamp(core.sortValue);
  const exactAuthoritativeNow = parseExactPostgresTimestamp(authoritativeNow);
  if (
    !snapshotTimestamp
    || !sortTimestamp
    || !exactAuthoritativeNow
    || compareExactPostgresTimestamps(snapshotTimestamp, exactAuthoritativeNow) > 0
    || compareExactPostgresTimestamps(sortTimestamp, snapshotTimestamp) > 0
  ) invalid();
  return { ...core, snapshotTimestamp, sortTimestamp };
}

function canonicalMacInput(value: NotificationCursorCore) {
  return JSON.stringify({
    version: value.version,
    kind: value.kind,
    filter: value.filter,
    id: value.id,
    pageSize: value.pageSize,
    scope: value.scope,
    snapshot: value.snapshot,
    sortValue: value.sortValue,
  });
}

function isEnvelope(value: unknown): value is NotificationCursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  const expectedKeys = [
    "filter", "id", "kind", "mac", "pageSize", "scope", "snapshot",
    "sortValue", "version",
  ].sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && item.version === NOTIFICATION_CURSOR_ENVELOPE_VERSION
    && item.kind === "NOTIFICATION_CURSOR"
    && typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter)
    && typeof item.id === "string" && isUuid(item.id)
    && typeof item.pageSize === "number" && Number.isInteger(item.pageSize)
    && item.pageSize > 0 && item.pageSize <= 50
    && typeof item.scope === "string" && item.scope.length > 0 && item.scope.length <= 180
    && typeof item.snapshot === "string" && item.snapshot.length <= 64
    && typeof item.sortValue === "string" && item.sortValue.length <= 64
    && typeof item.mac === "string" && item.mac.length <= 128;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function invalid(): never {
  return notificationError("INVALID_CURSOR", "Notification cursor is invalid.");
}
