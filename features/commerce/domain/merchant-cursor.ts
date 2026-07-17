import { createHash } from "node:crypto";

import { commerceError } from "@/features/commerce/domain/errors";
import { canonicalRequestJson } from "@/features/commerce/domain/idempotency";

type CursorKind = "products" | "inventory" | "movements";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MerchantCursorValue {
  actor: string;
  filter: string;
  id: string;
  kind: CursorKind;
  snapshot: string;
  sortValue: string;
  target: string;
}

type Encoded = MerchantCursorValue & { checksum: string; version: 1 };

function checksum(value: MerchantCursorValue) {
  return createHash("sha256")
    .update(`rezno-merchant-commerce-cursor:${canonicalRequestJson({
      actor: value.actor,
      filter: value.filter,
      id: value.id,
      kind: value.kind,
      snapshot: value.snapshot,
      sortValue: value.sortValue,
      target: value.target,
    })}`)
    .digest("hex");
}

export function merchantCursorFingerprint(value: Record<string, boolean | null | string | undefined>) {
  return createHash("sha256").update(canonicalRequestJson(value)).digest("hex");
}

export function encodeMerchantCursor(value: MerchantCursorValue) {
  return Buffer.from(
    JSON.stringify({ ...value, checksum: checksum(value), version: 1 }),
    "utf8",
  ).toString("base64url");
}

export function decodeMerchantCursor(
  encoded: string,
  expected: Pick<MerchantCursorValue, "actor" | "filter" | "kind" | "target">,
) {
  if (!encoded || encoded.length > 2_048) invalid();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEncoded(value)) invalid();
  const core: MerchantCursorValue = {
    actor: value.actor,
    filter: value.filter,
    id: value.id,
    kind: value.kind,
    snapshot: value.snapshot,
    sortValue: value.sortValue,
    target: value.target,
  };
  if (
    value.checksum !== checksum(core) ||
    core.actor !== expected.actor ||
    core.filter !== expected.filter ||
    core.kind !== expected.kind ||
    core.target !== expected.target
  ) invalid();
  return { ...core, snapshotDate: strictDate(core.snapshot), sortDate: strictDate(core.sortValue) };
}

function isEncoded(value: unknown): value is Encoded {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.version === 1 &&
    typeof item.actor === "string" && item.actor.length <= 200 &&
    typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter) &&
    typeof item.id === "string" && UUID_PATTERN.test(item.id) &&
    (item.kind === "products" || item.kind === "inventory" || item.kind === "movements") &&
    typeof item.snapshot === "string" &&
    typeof item.sortValue === "string" &&
    typeof item.target === "string" && item.target.length <= 100 &&
    typeof item.checksum === "string" && /^[a-f0-9]{64}$/.test(item.checksum)
  );
}

function strictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) invalid();
  return date;
}

function invalid(): never {
  commerceError("INVALID_CURSOR", "Merchant Commerce cursor is invalid for this scope.");
}
