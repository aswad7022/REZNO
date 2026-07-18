import { createHash } from "node:crypto";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { commerceError } from "@/features/commerce/domain/errors";
import { canonicalRequestJson, type CanonicalValue } from "@/features/commerce/domain/idempotency";

export const ADMIN_PAGE_LIMIT_MAX = 50;
export const ADMIN_DATE_RANGE_MAX_DAYS = 366;

type AdminCursorCore = {
  actor: string;
  filter: string;
  id: string;
  kind: string;
  permission: AdminPermission;
  snapshot: string;
  sortValue: string;
  target: string;
};

type AdminCursorEnvelope = AdminCursorCore & { checksum: string; version: 1 };

export function adminActorScope(input: {
  adminAccessId: string | null;
  source: "database" | "env";
  userId: string;
}) {
  return `${input.source}:${input.adminAccessId ?? "environment"}:${input.userId}`;
}

export function adminFilterFingerprint(value: CanonicalValue) {
  return createHash("sha256").update(canonicalRequestJson(value)).digest("hex");
}

export function encodeAdminCursor(value: AdminCursorCore) {
  return Buffer.from(
    JSON.stringify({ ...value, checksum: cursorChecksum(value), version: 1 }),
    "utf8",
  ).toString("base64url");
}

export function decodeAdminCursor(
  encoded: string,
  expected: Pick<AdminCursorCore, "actor" | "filter" | "kind" | "permission" | "target">,
) {
  if (!encoded || encoded.length > 3_000) invalidCursor();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    invalidCursor();
  }
  if (!isAdminCursorEnvelope(decoded)) invalidCursor();
  const core: AdminCursorCore = {
    actor: decoded.actor,
    filter: decoded.filter,
    id: decoded.id,
    kind: decoded.kind,
    permission: decoded.permission,
    snapshot: decoded.snapshot,
    sortValue: decoded.sortValue,
    target: decoded.target,
  };
  if (
    decoded.checksum !== cursorChecksum(core) ||
    core.actor !== expected.actor ||
    core.filter !== expected.filter ||
    core.kind !== expected.kind ||
    core.permission !== expected.permission ||
    core.target !== expected.target
  ) {
    invalidCursor();
  }
  return {
    ...core,
    snapshotDate: strictCursorDate(core.snapshot),
    sortDate: strictCursorDate(core.sortValue),
  };
}

export function assertAdminPageLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > ADMIN_PAGE_LIMIT_MAX) {
    commerceError("VALIDATION_ERROR", `Admin page size must be between 1 and ${ADMIN_PAGE_LIMIT_MAX}.`);
  }
}

export function parseCanonicalInstant(value: string | undefined, field: string) {
  if (value === undefined || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    commerceError("VALIDATION_ERROR", `${field} must be a complete ISO-8601 instant with an offset.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    commerceError("VALIDATION_ERROR", `${field} is not a valid instant.`);
  }
  return date;
}

export function assertDateRange(
  from: Date | undefined,
  to: Date | undefined,
  maximumDays = ADMIN_DATE_RANGE_MAX_DAYS,
) {
  if (from && to && from.getTime() > to.getTime()) {
    commerceError("VALIDATION_ERROR", "The date range start must not be after its end.");
  }
  if (from && to && to.getTime() - from.getTime() > maximumDays * 86_400_000) {
    commerceError("VALIDATION_ERROR", `The date range must not exceed ${maximumDays} days.`);
  }
}

export function isOverduePending(
  status: string,
  reservationExpiresAt: Date,
  evaluationTime: Date,
) {
  return status === "PENDING" && reservationExpiresAt.getTime() <= evaluationTime.getTime();
}

function cursorChecksum(value: AdminCursorCore) {
  return createHash("sha256")
    .update(`rezno-admin-commerce-cursor:${canonicalRequestJson(value)}`)
    .digest("hex");
}

function isAdminCursorEnvelope(value: unknown): value is AdminCursorEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 &&
    typeof item.actor === "string" && item.actor.length <= 300 &&
    typeof item.filter === "string" && /^[a-f0-9]{64}$/.test(item.filter) &&
    typeof item.id === "string" && /^[0-9a-f-]{36}$/i.test(item.id) &&
    typeof item.kind === "string" && item.kind.length <= 80 &&
    typeof item.permission === "string" && item.permission.length <= 80 &&
    typeof item.snapshot === "string" &&
    typeof item.sortValue === "string" &&
    typeof item.target === "string" && item.target.length <= 100 &&
    typeof item.checksum === "string" && /^[a-f0-9]{64}$/.test(item.checksum);
}

function strictCursorDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) invalidCursor();
  return date;
}

function invalidCursor(): never {
  commerceError("INVALID_CURSOR", "Admin Commerce cursor is invalid for this actor and filter scope.");
}
