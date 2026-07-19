import "server-only";

import type { MessageActor } from "@/features/messages/domain/contracts";
import { messageActorScopeKey, messageRequestHash } from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";
import {
  signMessageCursor,
  verifyMessageCursorMac,
} from "@/features/messages/domain/cursor-signing";
import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "@/lib/db/postgres-timestamp";

export const MESSAGE_CURSOR_ENVELOPE_VERSION = 3;
export const MESSAGE_CURSOR_MAX_LENGTH = 3_000;

type CursorKind = "CONVERSATION_CURSOR" | "MESSAGE_CURSOR";

interface CursorCore {
  version: typeof MESSAGE_CURSOR_ENVELOPE_VERSION;
  kind: CursorKind;
  conversationId: string | null;
  filter: string;
  id: string;
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
}

type CursorEnvelope = CursorCore & { mac: string };

type CursorValue = {
  conversationId?: string;
  filter: string;
  id: string;
  kind: "conversation" | "message";
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
};

export function messageFilterFingerprint(value: unknown) {
  return messageRequestHash({ filter: value });
}

export function encodeMessageCursor(value: CursorValue) {
  const snapshot = parseExactPostgresTimestamp(value.snapshot);
  const sortValue = parseExactPostgresTimestamp(value.sortValue);
  if (
    !snapshot
    || !sortValue
    || compareExactPostgresTimestamps(sortValue, snapshot) > 0
  ) invalid();
  const core: CursorCore = {
    version: MESSAGE_CURSOR_ENVELOPE_VERSION,
    kind: value.kind === "conversation" ? "CONVERSATION_CURSOR" : "MESSAGE_CURSOR",
    conversationId: value.conversationId ?? null,
    filter: value.filter,
    id: value.id,
    pageSize: value.pageSize,
    scope: value.scope,
    snapshot,
    sortValue,
  };
  let mac: string;
  try {
    mac = signMessageCursor(canonicalMacInput(core)).toString("hex");
  } catch {
    invalid();
  }
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString("base64url");
}

export function decodeMessageCursor(
  encoded: string,
  expected: {
    actor: MessageActor;
    conversationId?: string;
    filter: string;
    kind: "conversation" | "message";
    pageSize: number;
  },
  authoritativeNow: string,
) {
  if (
    !encoded
    || encoded.length > MESSAGE_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) invalid();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(decoded)) invalid();
  const core: CursorCore = {
    version: decoded.version,
    kind: decoded.kind,
    conversationId: decoded.conversationId,
    filter: decoded.filter,
    id: decoded.id,
    pageSize: decoded.pageSize,
    scope: decoded.scope,
    snapshot: decoded.snapshot,
    sortValue: decoded.sortValue,
  };
  let authenticated = false;
  try {
    authenticated = verifyMessageCursorMac(canonicalMacInput(core), decoded.mac);
  } catch {
    invalid();
  }
  if (!authenticated) invalid();
  const expectedKind: CursorKind = expected.kind === "conversation"
    ? "CONVERSATION_CURSOR"
    : "MESSAGE_CURSOR";
  if (
    core.kind !== expectedKind
    || core.filter !== expected.filter
    || core.pageSize !== expected.pageSize
    || core.scope !== messageActorScopeKey(expected.actor)
    || core.conversationId !== (expected.conversationId ?? null)
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

function canonicalMacInput(value: CursorCore) {
  return JSON.stringify({
    version: value.version,
    kind: value.kind,
    conversationId: value.conversationId,
    filter: value.filter,
    id: value.id,
    pageSize: value.pageSize,
    scope: value.scope,
    snapshot: value.snapshot,
    sortValue: value.sortValue,
  });
}

function isEnvelope(value: unknown): value is CursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  const expectedKeys = [
    "conversationId", "filter", "id", "kind", "mac", "pageSize", "scope",
    "snapshot", "sortValue", "version",
  ].sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && item.version === MESSAGE_CURSOR_ENVELOPE_VERSION
    && (item.kind === "CONVERSATION_CURSOR" || item.kind === "MESSAGE_CURSOR")
    && (item.conversationId === null || (typeof item.conversationId === "string" && isUuid(item.conversationId)))
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
  return messageError("INVALID_CURSOR", "Messaging cursor is invalid.");
}
