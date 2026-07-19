import "server-only";

import { storageError } from "@/features/storage/domain/errors";
import { isUuid, storageRequestHash } from "@/features/storage/domain/policy";
import { signStorageCursor, verifyStorageCursor } from "@/features/storage/domain/cursor-signing";
import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "@/lib/db/postgres-timestamp";

const VERSION = 1;
export const STORAGE_CURSOR_MAX_LENGTH = 3_000;

type CursorKind = "ASSET" | "SESSION";
type CursorCore = {
  filter: string;
  id: string;
  kind: CursorKind;
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
  version: typeof VERSION;
};
type CursorEnvelope = CursorCore & { mac: string };

export function storageCursorScope(value: unknown) {
  return storageRequestHash({ scope: value });
}

export function storageCursorFilter(value: unknown) {
  return storageRequestHash({ filter: value });
}

export function encodeStorageCursor(
  kind: CursorKind,
  value: Omit<CursorCore, "kind" | "version">,
) {
  const snapshot = parseExactPostgresTimestamp(value.snapshot);
  const sortValue = parseExactPostgresTimestamp(value.sortValue);
  if (!snapshot || !sortValue || compareExactPostgresTimestamps(sortValue, snapshot) > 0) invalid();
  const core: CursorCore = { ...value, kind, snapshot, sortValue, version: VERSION };
  let mac: string;
  try {
    mac = signStorageCursor(kind, canonical(core)).toString("hex");
  } catch {
    invalid();
  }
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString("base64url");
}

export function decodeStorageCursor(
  kind: CursorKind,
  encoded: string,
  expected: { filter: string; pageSize: number; scope: string },
  authoritativeNow: string,
) {
  if (!encoded || encoded.length > STORAGE_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(value)) invalid();
  const { mac, ...core } = value;
  let authenticated = false;
  try {
    authenticated = verifyStorageCursor(kind, canonical(core), mac);
  } catch {
    invalid();
  }
  if (!authenticated
    || core.kind !== kind
    || core.scope !== expected.scope
    || core.filter !== expected.filter
    || core.pageSize !== expected.pageSize) invalid();
  const snapshot = parseExactPostgresTimestamp(core.snapshot);
  const sortValue = parseExactPostgresTimestamp(core.sortValue);
  const now = parseExactPostgresTimestamp(authoritativeNow);
  if (!snapshot || !sortValue || !now
    || compareExactPostgresTimestamps(snapshot, now) > 0
    || compareExactPostgresTimestamps(sortValue, snapshot) > 0) invalid();
  return { ...core, snapshot, sortValue };
}

function canonical(value: CursorCore) {
  return JSON.stringify({
    filter: value.filter,
    id: value.id,
    kind: value.kind,
    pageSize: value.pageSize,
    scope: value.scope,
    snapshot: value.snapshot,
    sortValue: value.sortValue,
    version: value.version,
  });
}

function isEnvelope(value: unknown): value is CursorEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const expected = ["filter", "id", "kind", "mac", "pageSize", "scope", "snapshot", "sortValue", "version"].sort();
  const keys = Object.keys(item).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && item.version === VERSION
    && (item.kind === "ASSET" || item.kind === "SESSION")
    && typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter)
    && typeof item.scope === "string" && /^[a-f0-9]{64}$/.test(item.scope)
    && typeof item.id === "string" && isUuid(item.id)
    && typeof item.pageSize === "number" && Number.isInteger(item.pageSize) && item.pageSize >= 1 && item.pageSize <= 50
    && typeof item.snapshot === "string" && item.snapshot.length <= 64
    && typeof item.sortValue === "string" && item.sortValue.length <= 64
    && typeof item.mac === "string" && /^[a-f0-9]{64}$/.test(item.mac);
}

function invalid(): never {
  return storageError("INVALID_CURSOR", "Storage cursor is invalid.");
}
