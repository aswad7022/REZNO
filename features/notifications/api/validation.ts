import type { NotificationCategory } from "@prisma/client";

import { notificationCategories } from "@/features/notifications/domain/contracts";
import { notificationError } from "@/features/notifications/domain/errors";
import type { NotificationInboxFilter, NotificationInboxQuery } from "@/features/notifications/services/inbox-service";

const FILTERS = ["all", "archived", "important", "read", "unread"] as const satisfies readonly NotificationInboxFilter[];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseNotificationInboxQuery(params: URLSearchParams): NotificationInboxQuery {
  assertUnique(params, ["category", "cursor", "filter", "from", "limit", "to"]);
  const filter = (params.get("filter")?.trim() || "all") as NotificationInboxFilter;
  if (!FILTERS.includes(filter)) invalid("filter is invalid.");
  const rawCategory = params.get("category")?.trim().toUpperCase();
  if (rawCategory && !notificationCategories.includes(rawCategory as NotificationCategory)) invalid("category is invalid.");
  const rawLimit = params.get("limit")?.trim();
  const limit = rawLimit ? Number(rawLimit) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid("limit must be an integer from 1 to 50.");
  const cursor = params.get("cursor")?.trim() || undefined;
  if (cursor && (cursor.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(cursor))) invalid("cursor is invalid.");
  const from = parseOptionalDate(params.get("from"), "from");
  const to = parseOptionalDate(params.get("to"), "to", true);
  if (from && to && (from > to || to.getTime() - from.getTime() > 366 * 86_400_000)) invalid("date range is invalid.");
  return {
    category: rawCategory as NotificationCategory | undefined,
    cursor,
    filter,
    from,
    limit,
    to,
  };
}

export async function parseNotificationStateRequest(request: Request, notificationId: string) {
  const body = await readJson(request, ["action", "expectedVersion"]);
  const action = body.action;
  if (action !== "ARCHIVE" && action !== "MARK_READ" && action !== "MARK_UNREAD" && action !== "RESTORE") {
    invalid("action is invalid.");
  }
  return {
    action: action as "ARCHIVE" | "MARK_READ" | "MARK_UNREAD" | "RESTORE",
    expectedVersion: parseVersion(body.expectedVersion),
    idempotencyKey: parseIdempotencyKey(request),
    notificationId: parseUuid(notificationId, "notificationId"),
  };
}

export async function parseMarkAllRequest(request: Request) {
  const body = await readJson(request, ["expectedVersion", "snapshot"]);
  const snapshot = typeof body.snapshot === "string" ? new Date(body.snapshot) : new Date(Number.NaN);
  if (!Number.isFinite(snapshot.getTime()) || snapshot.toISOString() !== body.snapshot) invalid("snapshot must be a canonical UTC timestamp.");
  return { expectedVersion: parseVersion(body.expectedVersion), idempotencyKey: parseIdempotencyKey(request), snapshot };
}

export async function parseNotificationPreferencesRequest(request: Request) {
  const allowed = [
    "adminAnnouncementsEnabled", "bookingsEnabled", "commerceEnabled", "expectedVersion", "messagesEnabled", "restaurantEnabled",
  ] as const;
  const body = await readJson(request, allowed);
  const values = Object.fromEntries(allowed.filter((key) => key !== "expectedVersion").map((key) => {
    if (typeof body[key] !== "boolean") invalid(`${key} must be boolean.`);
    return [key, body[key]];
  }));
  return {
    ...(values as {
      adminAnnouncementsEnabled: boolean; bookingsEnabled: boolean; commerceEnabled: boolean;
      messagesEnabled: boolean; restaurantEnabled: boolean;
    }),
    expectedVersion: parseVersion(body.expectedVersion),
    idempotencyKey: parseIdempotencyKey(request),
  };
}

function parseOptionalDate(value: string | null, name: string, endOfDay = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${name} must be YYYY-MM-DD.`);
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${name} is invalid.`);
  return parsed;
}

function parseIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!UUID_PATTERN.test(value) || value.includes(",")) invalid("Idempotency-Key must be one UUID.");
  return value.toLowerCase();
}

function parseUuid(value: string, name: string) {
  if (!UUID_PATTERN.test(value)) invalid(`${name} must be a UUID.`);
  return value.toLowerCase();
}

function parseVersion(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 0) invalid("expectedVersion must be a non-negative integer.");
  return value as number;
}

async function readJson(request: Request, allowed: readonly string[]) {
  let value: unknown;
  try { value = await request.json(); } catch { invalid("Request body must be JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Request body must be an object.");
  const object = value as Record<string, unknown>;
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid("Request body contains unknown fields.");
  return object;
}

function assertUnique(params: URLSearchParams, allowed: readonly string[]) {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid("Query parameters are invalid.");
}

function invalid(message: string): never {
  return notificationError("VALIDATION_ERROR", message);
}
