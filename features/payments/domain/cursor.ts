import "server-only";

import { paymentError } from "@/features/payments/domain/errors";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import {
  signPaymentCursor,
  verifyPaymentCursor,
  type PaymentCursorKind,
} from "@/features/payments/domain/cursor-signing";
import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "@/lib/db/postgres-timestamp";

const VERSION = 1;
const MAX_CURSOR_LENGTH = 3_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CursorCore = {
  filter: string;
  id: string;
  kind: PaymentCursorKind;
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
  version: typeof VERSION;
};

export function paymentCursorBinding(value: unknown): string {
  return paymentRequestHash(value);
}

export function encodePaymentCursor(
  kind: PaymentCursorKind,
  value: Omit<CursorCore, "kind" | "version">,
): string {
  const snapshot = parseExactPostgresTimestamp(value.snapshot);
  const sortValue = parseExactPostgresTimestamp(value.sortValue);
  if (!snapshot || !sortValue || compareExactPostgresTimestamps(sortValue, snapshot) > 0) invalid();
  const core: CursorCore = { ...value, kind, snapshot, sortValue, version: VERSION };
  let mac: string;
  try { mac = signPaymentCursor(kind, canonical(core)).toString("hex"); } catch { invalid(); }
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString("base64url");
}

export function decodePaymentCursor(
  kind: PaymentCursorKind,
  encoded: string,
  expected: { filter: string; pageSize: number; scope: string },
  authoritativeNow: string,
) {
  if (!encoded || encoded.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid();
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { invalid(); }
  if (!isEnvelope(value)) invalid();
  const { mac, ...core } = value;
  let valid = false;
  try { valid = verifyPaymentCursor(kind, canonical(core), mac); } catch { invalid(); }
  if (!valid || core.kind !== kind || core.filter !== expected.filter || core.pageSize !== expected.pageSize || core.scope !== expected.scope) invalid();
  const snapshot = parseExactPostgresTimestamp(core.snapshot);
  const sortValue = parseExactPostgresTimestamp(core.sortValue);
  const now = parseExactPostgresTimestamp(authoritativeNow);
  if (!snapshot || !sortValue || !now || compareExactPostgresTimestamps(snapshot, now) > 0 || compareExactPostgresTimestamps(sortValue, snapshot) > 0) invalid();
  return { ...core, snapshot, sortValue };
}

function canonical(value: CursorCore): string {
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

function isEnvelope(value: unknown): value is CursorCore & { mac: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const expected = ["filter", "id", "kind", "mac", "pageSize", "scope", "snapshot", "sortValue", "version"].sort();
  const keys = Object.keys(item).sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    item.version === VERSION &&
    (item.kind === "INTENT" || item.kind === "REFUND" || item.kind === "JOURNAL" || item.kind === "SETTLEMENT") &&
    typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter) &&
    typeof item.scope === "string" && /^[a-f0-9]{64}$/.test(item.scope) &&
    typeof item.id === "string" && UUID_PATTERN.test(item.id) &&
    typeof item.pageSize === "number" && Number.isInteger(item.pageSize) && item.pageSize >= 1 && item.pageSize <= 50 &&
    typeof item.snapshot === "string" && item.snapshot.length <= 64 &&
    typeof item.sortValue === "string" && item.sortValue.length <= 64 &&
    typeof item.mac === "string" && /^[a-f0-9]{64}$/.test(item.mac);
}

function invalid(): never {
  paymentError("INVALID_CURSOR", "Payment cursor is invalid.");
}
