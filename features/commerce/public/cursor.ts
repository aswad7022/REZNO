import { createHash } from "node:crypto";

import { canonicalRequestJson } from "@/features/commerce/domain/idempotency";
import { publicCommerceError } from "@/features/commerce/public/errors";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;

interface CursorCore {
  f: string;
  i: string;
  k: string;
  s: string;
  v: typeof CURSOR_VERSION;
}

interface EncodedCursor extends CursorCore {
  c: string;
}

export interface PublicCursor {
  fingerprint: string;
  id: string;
  sort: string;
  sortValue: string;
}

function checksum(core: CursorCore) {
  return createHash("sha256")
    .update(
      `rezno-public-commerce-cursor:${canonicalRequestJson({
        f: core.f,
        i: core.i,
        k: core.k,
        s: core.s,
        v: core.v,
      })}`,
    )
    .digest("hex");
}

export function publicQueryFingerprint(value: Record<string, boolean | null | string | undefined>) {
  return createHash("sha256").update(canonicalRequestJson(value)).digest("hex");
}

export function encodePublicCursor(value: PublicCursor): string {
  const core: CursorCore = {
    f: value.fingerprint,
    i: value.id,
    k: value.sortValue,
    s: value.sort,
    v: CURSOR_VERSION,
  };
  return Buffer.from(JSON.stringify({ ...core, c: checksum(core) }), "utf8").toString("base64url");
}

export function decodePublicCursor(
  encoded: string,
  expected: { fingerprint: string; sort: string },
): PublicCursor {
  if (!encoded || encoded.length > MAX_CURSOR_LENGTH) invalidCursor();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  if (!isEncodedCursor(value)) invalidCursor();
  const core: CursorCore = { f: value.f, i: value.i, k: value.k, s: value.s, v: value.v };
  if (
    value.c !== checksum(core) ||
    value.f !== expected.fingerprint ||
    value.s !== expected.sort
  ) {
    invalidCursor();
  }
  return { fingerprint: value.f, id: value.i, sort: value.s, sortValue: value.k };
}

function isEncodedCursor(value: unknown): value is EncodedCursor {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.v === CURSOR_VERSION &&
    typeof item.s === "string" &&
    typeof item.f === "string" &&
    /^[a-f0-9]{64}$/.test(item.f) &&
    typeof item.k === "string" &&
    item.k.length <= 500 &&
    typeof item.i === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.i) &&
    typeof item.c === "string" &&
    /^[a-f0-9]{64}$/.test(item.c)
  );
}

function invalidCursor(): never {
  return publicCommerceError("INVALID_CURSOR", 400, "The cursor is invalid for this query.");
}
