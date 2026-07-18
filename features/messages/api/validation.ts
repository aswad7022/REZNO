import type {
  ConversationListMode,
  ConversationListQuery,
  MessageHistoryQuery,
} from "@/features/messages/services/query-service";
import { isUuid } from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const MODES = ["admin", "all", "booking", "unread"] as const satisfies readonly ConversationListMode[];

export function parseConversationListQuery(
  params: URLSearchParams,
): ConversationListQuery {
  assertUniqueQuery(params, ["cursor", "limit", "mode", "q"]);
  const rawMode = params.get("mode")?.trim() || "all";
  if (!MODES.includes(rawMode as ConversationListMode)) {
    invalid("mode is invalid.");
  }
  const search = params.get("q")?.trim() || undefined;
  if (search && Array.from(search).length > 80) {
    invalid("q must not exceed 80 characters.");
  }
  return {
    cursor: parseCursor(params.get("cursor")),
    limit: parseLimit(params.get("limit"), 20),
    mode: rawMode as ConversationListMode,
    search,
  };
}

export function parseMessageHistoryQuery(
  params: URLSearchParams,
): MessageHistoryQuery {
  assertUniqueQuery(params, ["cursor", "limit"]);
  return {
    cursor: parseCursor(params.get("cursor")),
    limit: parseLimit(params.get("limit"), 30),
  };
}

export function parseConversationId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!isUuid(normalized)) invalid("conversationId must be a UUID.");
  return normalized;
}

export async function parseSendMessageRequest(request: Request) {
  const body = await readJsonObject(request, ["body"]);
  return {
    body: body.body,
    idempotencyKey: parseMessageIdempotencyKey(request),
  };
}

export async function parseStartConversationRequest(request: Request) {
  const body = await readJsonObject(request, ["body", "businessId"]);
  if (typeof body.businessId !== "string" || !isUuid(body.businessId.trim())) {
    invalid("businessId must be a UUID.");
  }
  return {
    body: body.body,
    businessId: body.businessId.trim().toLowerCase(),
    idempotencyKey: parseMessageIdempotencyKey(request),
  };
}

export async function parseMarkConversationReadRequest(request: Request) {
  const body = await readJsonObject(request, ["throughMessageId"]);
  if (body.throughMessageId === undefined || body.throughMessageId === null) {
    return { throughMessageId: undefined };
  }
  if (
    typeof body.throughMessageId !== "string" ||
    !isUuid(body.throughMessageId.trim())
  ) {
    invalid("throughMessageId must be a UUID.");
  }
  return { throughMessageId: body.throughMessageId.trim().toLowerCase() };
}

export function assertNoMessageQuery(params: URLSearchParams) {
  assertUniqueQuery(params, []);
}

export function assertMobileMutationRequest(request: Request) {
  if (request.headers.get("expo-origin") !== "rezno://") {
    messageError("FORBIDDEN", "The mobile mutation origin is not allowed.");
  }
}

function parseMessageIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (value.includes(",") || !isUuid(value)) {
    invalid("Idempotency-Key must be one UUID.");
  }
  return value.toLowerCase();
}

function parseCursor(value: string | null) {
  const cursor = value?.trim() || undefined;
  if (cursor && (cursor.length > 3_000 || !CURSOR_PATTERN.test(cursor))) {
    invalid("cursor is invalid.");
  }
  return cursor;
}

function parseLimit(value: string | null, fallback: number) {
  const limit = value === null ? fallback : Number(value.trim());
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    invalid("limit must be an integer from 1 to 50.");
  }
  return limit;
}

async function readJsonObject(
  request: Request,
  allowed: readonly string[],
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    invalid("Request body must be a JSON object.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) invalid(`Unsupported field: ${key}.`);
  }
  return body;
}

function assertUniqueQuery(
  params: URLSearchParams,
  allowed: readonly string[],
) {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      invalid(`Unsupported or duplicate query parameter: ${key}.`);
    }
  }
}

function invalid(message: string): never {
  return messageError("VALIDATION_ERROR", message);
}
