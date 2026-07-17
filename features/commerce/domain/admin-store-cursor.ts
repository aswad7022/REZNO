import { createHash } from "node:crypto";

import { commerceError } from "@/features/commerce/domain/errors";
import { canonicalRequestJson } from "@/features/commerce/domain/idempotency";

interface AdminStoreCursorValue {
  actor: string;
  filter: string;
  id: string;
  snapshot: string;
  sort: "submitted_asc" | "updated_desc";
  sortValue: string;
}

type Encoded = AdminStoreCursorValue & { checksum: string; version: 1 };

function checksum(value: AdminStoreCursorValue) {
  return createHash("sha256")
    .update(`rezno-admin-store-cursor:${canonicalRequestJson({ ...value })}`)
    .digest("hex");
}

export function encodeAdminStoreCursor(value: AdminStoreCursorValue) {
  return Buffer.from(
    JSON.stringify({ ...value, checksum: checksum(value), version: 1 }),
    "utf8",
  ).toString("base64url");
}

export function decodeAdminStoreCursor(
  encoded: string,
  expected: Pick<AdminStoreCursorValue, "actor" | "filter" | "sort">,
) {
  if (!encoded || encoded.length > 2_048) invalid();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (!isEncoded(value)) invalid();
  const core: AdminStoreCursorValue = {
    actor: value.actor,
    filter: value.filter,
    id: value.id,
    snapshot: value.snapshot,
    sort: value.sort,
    sortValue: value.sortValue,
  };
  if (
    value.checksum !== checksum(core) ||
    core.actor !== expected.actor ||
    core.filter !== expected.filter ||
    core.sort !== expected.sort
  ) {
    invalid();
  }
  strictDate(core.snapshot);
  strictDate(core.sortValue);
  return core;
}

function isEncoded(value: unknown): value is Encoded {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.version === 1 &&
    typeof item.actor === "string" && item.actor.length <= 200 &&
    typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter) &&
    typeof item.id === "string" && /^[0-9a-f-]{36}$/i.test(item.id) &&
    typeof item.snapshot === "string" &&
    (item.sort === "submitted_asc" || item.sort === "updated_desc") &&
    typeof item.sortValue === "string" &&
    typeof item.checksum === "string" && /^[a-f0-9]{64}$/.test(item.checksum)
  );
}

export function strictAdminCursorDate(value: string) {
  return strictDate(value);
}

function strictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) invalid();
  return date;
}

function invalid(): never {
  commerceError("INVALID_CURSOR", "Admin Store cursor is invalid for this scope.");
}
