import { createHash } from "node:crypto";

import { communicationError } from "@/features/communications/domain/errors";
import { communicationRequestHash } from "@/features/communications/domain/validation";
import type { CommunicationAdminContext } from "@/features/communications/services/admin-actor";

export const COMMUNICATION_CURSOR_MAX_LENGTH = 3_000;

type CommunicationCursorKind =
  | "COMMUNICATION_CAMPAIGN_CURSOR"
  | "OUTBOUND_DELIVERY_CURSOR"
  | "OUTBOUND_ATTEMPT_CURSOR";

type CursorCore = {
  adminScope: string;
  filterFingerprint: string;
  kind: CommunicationCursorKind;
  pageSize: number;
  parentId: string | null;
  snapshotTimestamp: string;
  sortTimestamp: string;
  tieBreakerId: string;
};

type CursorEnvelope = CursorCore & { checksum: string; version: 1 };

type CursorValue = {
  adminScope: string;
  filterFingerprint: string;
  pageSize: number;
  parentId: string | null;
  snapshot: Date;
  sortTimestamp: Date;
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
  authoritativeNow: Date,
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
  authoritativeNow: Date,
) {
  return decodeCursor(encoded, "OUTBOUND_DELIVERY_CURSOR", expected, authoritativeNow);
}

export function encodeAttemptCursor(value: CursorValue & { parentId: string }) {
  return encodeCursor("OUTBOUND_ATTEMPT_CURSOR", value);
}

export function decodeAttemptCursor(
  encoded: string,
  expected: CursorExpectation & { parentId: string },
  authoritativeNow: Date,
) {
  return decodeCursor(encoded, "OUTBOUND_ATTEMPT_CURSOR", expected, authoritativeNow);
}

function encodeCursor(kind: CommunicationCursorKind, value: CursorValue) {
  const core: CursorCore = {
    adminScope: value.adminScope,
    filterFingerprint: value.filterFingerprint,
    kind,
    pageSize: value.pageSize,
    parentId: value.parentId,
    snapshotTimestamp: value.snapshot.toISOString(),
    sortTimestamp: value.sortTimestamp.toISOString(),
    tieBreakerId: value.tieBreakerId,
  };
  return Buffer.from(JSON.stringify({ ...core, checksum: cursorChecksum(core), version: 1 }), "utf8")
    .toString("base64url");
}

function decodeCursor(
  encoded: string,
  kind: CommunicationCursorKind,
  expected: CursorExpectation,
  authoritativeNow: Date,
) {
  if (!encoded || encoded.length > COMMUNICATION_CURSOR_MAX_LENGTH) invalidCursor();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  if (!isCursorEnvelope(decoded)) invalidCursor();
  const core: CursorCore = {
    adminScope: decoded.adminScope,
    filterFingerprint: decoded.filterFingerprint,
    kind: decoded.kind,
    pageSize: decoded.pageSize,
    parentId: decoded.parentId,
    snapshotTimestamp: decoded.snapshotTimestamp,
    sortTimestamp: decoded.sortTimestamp,
    tieBreakerId: decoded.tieBreakerId,
  };
  if (
    decoded.checksum !== cursorChecksum(core)
    || core.kind !== kind
    || core.adminScope !== expected.adminScope
    || core.filterFingerprint !== expected.filterFingerprint
    || core.pageSize !== expected.pageSize
    || core.parentId !== expected.parentId
  ) invalidCursor();
  const snapshotDate = exactDate(core.snapshotTimestamp);
  const sortDate = exactDate(core.sortTimestamp);
  if (!Number.isFinite(authoritativeNow.getTime()) || snapshotDate > authoritativeNow || sortDate > snapshotDate) {
    invalidCursor();
  }
  return { ...core, snapshotDate, sortDate };
}

function cursorChecksum(value: CursorCore) {
  return createHash("sha256")
    .update(`rezno-communications-cursor:${JSON.stringify(value)}`)
    .digest("hex");
}

function isCursorEnvelope(value: unknown): value is CursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.version === 1
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
    && typeof item.snapshotTimestamp === "string"
    && typeof item.sortTimestamp === "string"
    && typeof item.tieBreakerId === "string" && isUuid(item.tieBreakerId)
    && typeof item.checksum === "string" && /^[a-f0-9]{64}$/.test(item.checksum);
}

function exactDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalidCursor();
  return date;
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
