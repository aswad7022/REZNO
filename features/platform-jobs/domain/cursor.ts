import "server-only";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { signPlatformJobCursor, verifyPlatformJobCursor } from "@/features/platform-jobs/domain/cursor-signing";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { compareExactPostgresTimestamps, parseExactPostgresTimestamp } from "@/lib/db/postgres-timestamp";

const VERSION = 1;
const MAX_CURSOR_LENGTH = 3_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CursorKind = "PLATFORM_JOB" | "PLATFORM_JOB_SCHEDULE";
type CursorCore = {
  adminScope: string;
  filter: string;
  id: string;
  kind: CursorKind;
  pageSize: number;
  snapshot: string;
  sortValue: string;
  version: typeof VERSION;
};

export function platformJobCursorBinding(value: unknown) {
  return platformJobHash(value);
}

export function encodePlatformJobCursor(
  kind: CursorKind,
  value: Omit<CursorCore, "kind" | "version">,
) {
  const snapshot = parseExactPostgresTimestamp(value.snapshot);
  const sortValue = parseExactPostgresTimestamp(value.sortValue);
  if (!snapshot || !sortValue || compareExactPostgresTimestamps(sortValue, snapshot) > 0) invalid();
  const core: CursorCore = { ...value, kind, snapshot, sortValue, version: VERSION };
  let mac: string;
  try {
    mac = signPlatformJobCursor(canonical(core)).toString("hex");
  } catch {
    invalid();
  }
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString("base64url");
}

export function decodePlatformJobCursor(
  kind: CursorKind,
  encoded: string,
  expected: { adminScope: string; filter: string; pageSize: number },
  authoritativeNow: string,
) {
  if (!encoded || encoded.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(value)) invalid();
  const { mac, ...core } = value;
  let valid = false;
  try {
    valid = verifyPlatformJobCursor(canonical(core), mac);
  } catch {
    invalid();
  }
  if (
    !valid
    || core.kind !== kind
    || core.adminScope !== expected.adminScope
    || core.filter !== expected.filter
    || core.pageSize !== expected.pageSize
  ) invalid();
  const snapshot = parseExactPostgresTimestamp(core.snapshot);
  const sortValue = parseExactPostgresTimestamp(core.sortValue);
  const now = parseExactPostgresTimestamp(authoritativeNow);
  if (!snapshot || !sortValue || !now || compareExactPostgresTimestamps(snapshot, now) > 0 || compareExactPostgresTimestamps(sortValue, snapshot) > 0) invalid();
  return { ...core, snapshot, sortValue };
}

function canonical(value: CursorCore) {
  return JSON.stringify({
    adminScope: value.adminScope,
    filter: value.filter,
    id: value.id,
    kind: value.kind,
    pageSize: value.pageSize,
    snapshot: value.snapshot,
    sortValue: value.sortValue,
    version: value.version,
  });
}

function isEnvelope(value: unknown): value is CursorCore & { mac: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const expected = ["adminScope", "filter", "id", "kind", "mac", "pageSize", "snapshot", "sortValue", "version"].sort();
  const keys = Object.keys(item).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && item.version === VERSION
    && (item.kind === "PLATFORM_JOB" || item.kind === "PLATFORM_JOB_SCHEDULE")
    && typeof item.adminScope === "string" && /^[a-f0-9]{64}$/.test(item.adminScope)
    && typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter)
    && typeof item.id === "string" && UUID.test(item.id)
    && typeof item.pageSize === "number" && Number.isInteger(item.pageSize) && item.pageSize >= 1 && item.pageSize <= PLATFORM_JOB_LIMITS.maxListPage
    && typeof item.snapshot === "string" && item.snapshot.length <= 64
    && typeof item.sortValue === "string" && item.sortValue.length <= 64
    && typeof item.mac === "string" && /^[a-f0-9]{64}$/.test(item.mac);
}

function invalid(): never {
  platformJobError("INVALID_CURSOR", "The platform-job cursor is invalid for this Admin scope and filter.");
}
