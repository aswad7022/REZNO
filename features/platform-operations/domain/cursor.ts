import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "@/lib/db/postgres-timestamp";

const VERSION = 1;
const MAX_CURSOR_LENGTH = 3_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let testSecret: string | null | undefined;

type CursorKind = "PLATFORM_ALERT" | "PLATFORM_INCIDENT";
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

export function platformOperationsCursorBinding(value: unknown) {
  return platformJobHash(value);
}

export function setPlatformOperationsCursorSigningSecretForTests(
  secret: string | null | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Platform operations cursor test configuration is unavailable.",
    );
  }
  testSecret = secret;
}

export function encodePlatformOperationsCursor(
  kind: CursorKind,
  value: Omit<CursorCore, "kind" | "version">,
) {
  const snapshot = parseExactPostgresTimestamp(value.snapshot);
  const sortValue = parseExactPostgresTimestamp(value.sortValue);
  if (
    !snapshot
    || !sortValue
    || compareExactPostgresTimestamps(sortValue, snapshot) > 0
  ) {
    invalid();
  }
  const core: CursorCore = {
    ...value,
    kind,
    snapshot,
    sortValue,
    version: VERSION,
  };
  return Buffer.from(
    JSON.stringify({
      ...core,
      mac: sign(canonical(core)).toString("hex"),
    }),
    "utf8",
  ).toString("base64url");
}

export function decodePlatformOperationsCursor(
  kind: CursorKind,
  encoded: string,
  expected: { adminScope: string; filter: string; pageSize: number },
  authoritativeNow: string,
) {
  if (
    !encoded
    || encoded.length > MAX_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    invalid();
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(value)) invalid();
  const { mac, ...core } = value;
  if (
    !verify(canonical(core), mac)
    || core.kind !== kind
    || core.adminScope !== expected.adminScope
    || core.filter !== expected.filter
    || core.pageSize !== expected.pageSize
  ) {
    invalid();
  }
  const snapshot = parseExactPostgresTimestamp(core.snapshot);
  const sortValue = parseExactPostgresTimestamp(core.sortValue);
  const now = parseExactPostgresTimestamp(authoritativeNow);
  if (
    !snapshot
    || !sortValue
    || !now
    || compareExactPostgresTimestamps(snapshot, now) > 0
    || compareExactPostgresTimestamps(sortValue, snapshot) > 0
  ) {
    invalid();
  }
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

function sign(value: string) {
  return createHmac("sha256", signingKey()).update(value, "utf8").digest();
}

function verify(value: string, mac: string) {
  if (!/^[0-9a-f]{64}$/.test(mac)) return false;
  const expected = sign(value);
  const received = Buffer.from(mac, "hex");
  return received.length === expected.length
    && timingSafeEqual(received, expected);
}

function signingKey() {
  const secret = testSecret === undefined
    ? process.env.BETTER_AUTH_SECRET
    : testSecret ?? undefined;
  if (
    !secret
    || secret !== secret.trim()
    || secret.length < 32
    || secret.length * Math.log2(new Set(secret).size) < 120
  ) {
    throw new Error("Platform operations cursor signing is unavailable.");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from("rezno:platform-operations:cursor:v1", "utf8"),
    32,
  ));
}

function isEnvelope(value: unknown): value is CursorCore & { mac: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const expected = [
    "adminScope",
    "filter",
    "id",
    "kind",
    "mac",
    "pageSize",
    "snapshot",
    "sortValue",
    "version",
  ].sort();
  const keys = Object.keys(item).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && item.version === VERSION
    && (item.kind === "PLATFORM_ALERT" || item.kind === "PLATFORM_INCIDENT")
    && typeof item.adminScope === "string"
    && /^[0-9a-f]{64}$/.test(item.adminScope)
    && typeof item.filter === "string"
    && /^[0-9a-f]{64}$/.test(item.filter)
    && typeof item.id === "string"
    && UUID.test(item.id)
    && typeof item.pageSize === "number"
    && Number.isInteger(item.pageSize)
    && item.pageSize >= 1
    && item.pageSize <= 50
    && typeof item.snapshot === "string"
    && item.snapshot.length <= 64
    && typeof item.sortValue === "string"
    && item.sortValue.length <= 64
    && typeof item.mac === "string"
    && /^[0-9a-f]{64}$/.test(item.mac);
}

function invalid(): never {
  platformJobError(
    "INVALID_CURSOR",
    "The platform operations cursor is invalid for this Admin scope and filter.",
  );
}
