import { createHash } from "node:crypto";

import type { MessageActor } from "@/features/messages/domain/contracts";
import {
  messageActorScopeKey,
  messageRequestHash,
} from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";

type CursorKind = "conversation" | "message";

interface CursorCore {
  conversationId?: string;
  filter: string;
  id: string;
  kind: CursorKind;
  pageSize: number;
  scope: string;
  snapshot: string;
  sortValue: string;
}

type CursorEnvelope = CursorCore & { checksum: string; version: 1 };

export function messageFilterFingerprint(value: unknown) {
  return messageRequestHash({ filter: value });
}

export function encodeMessageCursor(value: CursorCore) {
  return Buffer.from(
    JSON.stringify({ ...value, checksum: checksum(value), version: 1 }),
    "utf8",
  ).toString("base64url");
}

export function decodeMessageCursor(
  encoded: string,
  expected: {
    actor: MessageActor;
    conversationId?: string;
    filter: string;
    kind: CursorKind;
    pageSize: number;
  },
) {
  if (!encoded || encoded.length > 3_000) invalid();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEnvelope(decoded)) invalid();
  const core: CursorCore = {
    ...(decoded.conversationId
      ? { conversationId: decoded.conversationId }
      : {}),
    filter: decoded.filter,
    id: decoded.id,
    kind: decoded.kind,
    pageSize: decoded.pageSize,
    scope: decoded.scope,
    snapshot: decoded.snapshot,
    sortValue: decoded.sortValue,
  };
  if (
    decoded.checksum !== checksum(core) ||
    core.kind !== expected.kind ||
    core.filter !== expected.filter ||
    core.pageSize !== expected.pageSize ||
    core.scope !== messageActorScopeKey(expected.actor) ||
    core.conversationId !== expected.conversationId
  ) {
    invalid();
  }
  return {
    ...core,
    snapshotDate: exactDate(core.snapshot),
    sortDate: exactDate(core.sortValue),
  };
}

function checksum(value: CursorCore) {
  return createHash("sha256")
    .update(`rezno-message-cursor:${JSON.stringify(value)}`)
    .digest("hex");
}

function isEnvelope(value: unknown): value is CursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.version === 1 &&
    (item.kind === "conversation" || item.kind === "message") &&
    typeof item.filter === "string" &&
    /^[a-f0-9]{64}$/.test(item.filter) &&
    typeof item.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(item.id) &&
    typeof item.pageSize === "number" &&
    Number.isInteger(item.pageSize) &&
    item.pageSize > 0 &&
    item.pageSize <= 50 &&
    typeof item.scope === "string" &&
    item.scope.length <= 180 &&
    typeof item.snapshot === "string" &&
    typeof item.sortValue === "string" &&
    (item.conversationId === undefined ||
      (typeof item.conversationId === "string" &&
        /^[0-9a-f-]{36}$/i.test(item.conversationId))) &&
    typeof item.checksum === "string" &&
    /^[a-f0-9]{64}$/.test(item.checksum)
  );
}

function exactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) invalid();
  return date;
}

function invalid(): never {
  return messageError(
    "INVALID_CURSOR",
    "Messaging cursor is invalid for the current actor scope.",
  );
}
