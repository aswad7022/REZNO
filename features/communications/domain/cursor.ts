import "server-only";

import { communicationError } from "@/features/communications/domain/errors";
import { communicationRequestHash } from "@/features/communications/domain/validation";
import type { CommunicationAdminContext } from "@/features/communications/services/admin-actor";
import {
  signCommunicationCursor,
  verifyCommunicationCursorMac,
} from "@/features/communications/domain/cursor-signing";
import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "@/lib/db/postgres-timestamp";

export const COMMUNICATION_CURSOR_MAX_LENGTH = 3_000;
export const COMMUNICATION_CURSOR_ENVELOPE_VERSION = 3;

type CommunicationCursorKind =
  | "COMMUNICATION_CAMPAIGN_CURSOR"
  | "OUTBOUND_DELIVERY_CURSOR"
  | "OUTBOUND_ATTEMPT_CURSOR";

type CursorCore = {
  version: typeof COMMUNICATION_CURSOR_ENVELOPE_VERSION;
  kind: CommunicationCursorKind;
  adminScope: string;
  filterFingerprint: string;
  pageSize: number;
  parentId: string | null;
  snapshotTimestamp: string;
  sortTimestamp: string;
  tieBreakerId: string;
};

type CursorEnvelope = CursorCore & { mac: string };

type CursorValue = {
  adminScope: string;
  filterFingerprint: string;
  pageSize: number;
  parentId: string | null;
  snapshot: string;
  sortTimestamp: string;
  tieBreakerId: string;
};

type CursorExpectation = Pick<CursorValue,
  "adminScope" | "filterFingerprint" | "pageSize" | "parentId"
>;

export function communicationAdminCursorScope(context: CommunicationAdminContext) {
  return communicationRequestHash({
    adminAccessId: context.adminAccessId,
    source: context.source,
    userId: context.userId,
  });
}

export function communicationCursorFilterFingerprint(value: unknown) {
  return communicationRequestHash({ filter: value });
}

export function encodeCampaignCursor(value: Omit<CursorValue, "parentId">) {
  return encodeCursor("COMMUNICATION_CAMPAIGN_CURSOR", { ...value, parentId: null });
}

export function decodeCampaignCursor(
  encoded: string,
  expected: Omit<CursorExpectation, "parentId">,
  authoritativeNow: string,
) {
  return decodeCursor(
    encoded,
    "COMMUNICATION_CAMPAIGN_CURSOR",
    { ...expected, parentId: null },
    authoritativeNow,
  );
}

export function encodeDeliveryCursor(value: CursorValue & { parentId: string }) {
  return encodeCursor("OUTBOUND_DELIVERY_CURSOR", value);
}

export function decodeDeliveryCursor(
  encoded: string,
  expected: CursorExpectation & { parentId: string },
  authoritativeNow: string,
) {
  return decodeCursor(encoded, "OUTBOUND_DELIVERY_CURSOR", expected, authoritativeNow);
}

export function encodeAttemptCursor(value: CursorValue & { parentId: string }) {
  return encodeCursor("OUTBOUND_ATTEMPT_CURSOR", value);
}

export function decodeAttemptCursor(
  encoded: string,
  expected: CursorExpectation & { parentId: string },
  authoritativeNow: string,
) {
  return decodeCursor(encoded, "OUTBOUND_ATTEMPT_CURSOR", expected, authoritativeNow);
}

function encodeCursor(kind: CommunicationCursorKind, value: CursorValue) {
  const snapshotTimestamp = parseExactPostgresTimestamp(value.snapshot);
  const sortTimestamp = parseExactPostgresTimestamp(value.sortTimestamp);
  if (
    !snapshotTimestamp
    || !sortTimestamp
    || compareExactPostgresTimestamps(sortTimestamp, snapshotTimestamp) > 0
  ) invalidCursor();
  const core: CursorCore = {
    version: COMMUNICATION_CURSOR_ENVELOPE_VERSION,
    kind,
    adminScope: value.adminScope,
    filterFingerprint: value.filterFingerprint,
    pageSize: value.pageSize,
    parentId: value.parentId,
    snapshotTimestamp,
    sortTimestamp,
    tieBreakerId: value.tieBreakerId,
  };
  let mac: string;
  try {
    mac = signCommunicationCursor(canonicalCursorMacInput(core)).toString("hex");
  } catch {
    invalidCursor();
  }
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString("base64url");
}

function decodeCursor(
  encoded: string,
  kind: CommunicationCursorKind,
  expected: CursorExpectation,
  authoritativeNow: string,
) {
  if (
    !encoded
    || encoded.length > COMMUNICATION_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) invalidCursor();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  if (!isCursorEnvelope(decoded)) invalidCursor();
  const core: CursorCore = {
    version: decoded.version,
    kind: decoded.kind,
    adminScope: decoded.adminScope,
    filterFingerprint: decoded.filterFingerprint,
    pageSize: decoded.pageSize,
    parentId: decoded.parentId,
    snapshotTimestamp: decoded.snapshotTimestamp,
    sortTimestamp: decoded.sortTimestamp,
    tieBreakerId: decoded.tieBreakerId,
  };
  let authenticated = false;
  try {
    authenticated = verifyCommunicationCursorMac(
      canonicalCursorMacInput(core),
      decoded.mac,
    );
  } catch {
    invalidCursor();
  }
  if (!authenticated) invalidCursor();
  if (
    core.kind !== kind
    || core.adminScope !== expected.adminScope
    || core.filterFingerprint !== expected.filterFingerprint
    || core.pageSize !== expected.pageSize
    || core.parentId !== expected.parentId
  ) invalidCursor();
  const snapshotTimestamp = parseExactPostgresTimestamp(core.snapshotTimestamp);
  const sortTimestamp = parseExactPostgresTimestamp(core.sortTimestamp);
  const exactAuthoritativeNow = parseExactPostgresTimestamp(authoritativeNow);
  if (
    !snapshotTimestamp
    || !sortTimestamp
    || !exactAuthoritativeNow
    || compareExactPostgresTimestamps(snapshotTimestamp, exactAuthoritativeNow) > 0
    || compareExactPostgresTimestamps(sortTimestamp, snapshotTimestamp) > 0
  ) {
    invalidCursor();
  }
  return { ...core, snapshotTimestamp, sortTimestamp };
}

function canonicalCursorMacInput(value: CursorCore) {
  return JSON.stringify({
    version: value.version,
    kind: value.kind,
    adminScope: value.adminScope,
    filterFingerprint: value.filterFingerprint,
    pageSize: value.pageSize,
    parentId: value.parentId,
    snapshotTimestamp: value.snapshotTimestamp,
    sortTimestamp: value.sortTimestamp,
    tieBreakerId: value.tieBreakerId,
  });
}

function isCursorEnvelope(value: unknown): value is CursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  const envelopeKeys = [
    "adminScope",
    "filterFingerprint",
    "kind",
    "mac",
    "pageSize",
    "parentId",
    "snapshotTimestamp",
    "sortTimestamp",
    "tieBreakerId",
    "version",
  ].sort();
  return keys.length === envelopeKeys.length
    && keys.every((key, index) => key === envelopeKeys[index])
    && item.version === COMMUNICATION_CURSOR_ENVELOPE_VERSION
    && [
      "COMMUNICATION_CAMPAIGN_CURSOR",
      "OUTBOUND_DELIVERY_CURSOR",
      "OUTBOUND_ATTEMPT_CURSOR",
    ].includes(String(item.kind))
    && typeof item.adminScope === "string" && /^[a-f0-9]{64}$/.test(item.adminScope)
    && typeof item.filterFingerprint === "string" && /^[a-f0-9]{64}$/.test(item.filterFingerprint)
    && typeof item.pageSize === "number" && Number.isInteger(item.pageSize)
    && item.pageSize > 0 && item.pageSize <= 50
    && (item.parentId === null || (typeof item.parentId === "string" && isUuid(item.parentId)))
    && typeof item.snapshotTimestamp === "string" && item.snapshotTimestamp.length <= 64
    && typeof item.sortTimestamp === "string" && item.sortTimestamp.length <= 64
    && typeof item.tieBreakerId === "string" && isUuid(item.tieBreakerId)
    && typeof item.mac === "string" && item.mac.length <= 128;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function invalidCursor(): never {
  return communicationError(
    "INVALID_CURSOR",
    "Communication cursor is invalid for the current Admin and reporting scope.",
  );
}
