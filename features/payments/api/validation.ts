import type { FinancialJournalSource, FinancialJournalStatus, PaymentIntentStatus, PaymentRefundReason, PaymentRefundStatus, SettlementBatchStatus } from "@prisma/client";

import { paymentError } from "@/features/payments/domain/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT_STATUSES = ["CREATED", "REQUIRES_ACTION", "PROCESSING", "AUTHORIZED", "PARTIALLY_CAPTURED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "CANCELLED", "EXPIRED"] as const;
const REFUND_STATUSES = ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
const REFUND_REASONS = ["CUSTOMER_REQUEST", "MERCHANT_CANCELLATION", "ADMIN_CORRECTION", "DUPLICATE_PAYMENT", "SERVICE_UNAVAILABLE", "OTHER"] as const;
const SETTLEMENT_STATUSES = ["DRAFT", "FINALIZED", "VOID"] as const;
const JOURNAL_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;
const JOURNAL_SOURCES = ["CAPTURE", "REFUND", "SETTLEMENT", "REVERSAL", "RECONCILIATION"] as const;

export function paymentId(value: string, field = "id"): string {
  if (!UUID.test(value)) paymentError("VALIDATION_ERROR", field + " must be a UUID.");
  return value.toLowerCase();
}

export function paymentIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!UUID.test(value) || value.includes(",")) paymentError("VALIDATION_ERROR", "Idempotency-Key must be one UUID.");
  return value.toLowerCase();
}

export async function parseCreateIntent(request: Request) {
  const body = await readJson(request, ["targetId", "targetType"]);
  if (body.targetType !== "ORDER" && body.targetType !== "BOOKING") {
    paymentError("VALIDATION_ERROR", "targetType is invalid.");
  }
  return {
    targetId: paymentId(String(body.targetId ?? ""), "targetId"),
    targetType: body.targetType,
  } as const;
}

export async function parseRefundRequest(request: Request) {
  const body = await readJson(request, ["amount", "expectedVersion", "note", "reasonCode"]);
  if (typeof body.amount !== "string" || !/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/.test(body.amount)) {
    paymentError("VALIDATION_ERROR", "amount must be a canonical decimal string.");
  }
  if (!Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) {
    paymentError("VALIDATION_ERROR", "expectedVersion must be a positive integer.");
  }
  if (!REFUND_REASONS.includes(body.reasonCode as PaymentRefundReason)) {
    paymentError("VALIDATION_ERROR", "reasonCode is invalid.");
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    paymentError("VALIDATION_ERROR", "note must be text.");
  }
  return {
    amount: body.amount,
    expectedVersion: body.expectedVersion as number,
    note: body.note as string | null | undefined,
    reasonCode: body.reasonCode as PaymentRefundReason,
  };
}

export async function parseVersionedMutation(request: Request) {
  const body = await readJson(request, ["expectedVersion"]);
  if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) {
    paymentError("VALIDATION_ERROR", "expectedVersion must be a positive safe integer.");
  }
  return { expectedVersion: body.expectedVersion as number };
}

export async function parseSettlementPreview(request: Request) {
  const body = await readJson(request, ["currency", "organizationId", "periodEnd", "periodStart"]);
  if (body.currency !== "IQD") paymentError("VALIDATION_ERROR", "Settlement currency is invalid.");
  const periodStart = paymentDate(body.periodStart, "periodStart");
  const periodEnd = paymentDate(body.periodEnd, "periodEnd");
  return {
    currency: "IQD" as const,
    organizationId: paymentId(String(body.organizationId ?? ""), "organizationId"),
    periodEnd,
    periodStart,
  };
}

export function parseSettlementListQuery(url: URL) {
  assertQuery(url.searchParams, ["cursor", "limit", "organizationId", "status"]);
  const limit = queryLimit(url.searchParams.get("limit"));
  const status = url.searchParams.get("status");
  if (status && !SETTLEMENT_STATUSES.includes(status as SettlementBatchStatus)) {
    paymentError("VALIDATION_ERROR", "Settlement status is invalid.");
  }
  const organizationId = url.searchParams.get("organizationId");
  return {
    cursor: boundedCursor(url.searchParams.get("cursor")),
    limit,
    organizationId: organizationId ? paymentId(organizationId, "organizationId") : undefined,
    status: status as SettlementBatchStatus | undefined,
  };
}

export function parseJournalListQuery(url: URL) {
  assertQuery(url.searchParams, ["cursor", "limit", "organizationId", "source", "status"]);
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  if (status && !JOURNAL_STATUSES.includes(status as FinancialJournalStatus)) paymentError("VALIDATION_ERROR", "Journal status is invalid.");
  if (source && !JOURNAL_SOURCES.includes(source as FinancialJournalSource)) paymentError("VALIDATION_ERROR", "Journal source is invalid.");
  const organizationId = url.searchParams.get("organizationId");
  return {
    cursor: boundedCursor(url.searchParams.get("cursor")),
    limit: queryLimit(url.searchParams.get("limit")),
    organizationId: organizationId ? paymentId(organizationId, "organizationId") : undefined,
    source: source as FinancialJournalSource | undefined,
    status: status as FinancialJournalStatus | undefined,
  };
}

export async function parseReconciliationRequest(request: Request) {
  const body = await readJson(request, ["limit", "organizationId", "paymentIntentId"]);
  const limit = body.limit === undefined ? undefined : Number(body.limit);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)) {
    paymentError("VALIDATION_ERROR", "Reconciliation limit is invalid.");
  }
  if (body.organizationId !== undefined && typeof body.organizationId !== "string") paymentError("VALIDATION_ERROR", "organizationId is invalid.");
  if (body.paymentIntentId !== undefined && typeof body.paymentIntentId !== "string") paymentError("VALIDATION_ERROR", "paymentIntentId is invalid.");
  return {
    limit,
    organizationId: body.organizationId ? paymentId(body.organizationId, "organizationId") : undefined,
    paymentIntentId: body.paymentIntentId ? paymentId(body.paymentIntentId, "paymentIntentId") : undefined,
  };
}

export function parsePaymentListQuery(url: URL) {
  assertQuery(url.searchParams, ["cursor", "limit", "organizationId", "status"]);
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue === null ? undefined : Number(limitValue);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    paymentError("VALIDATION_ERROR", "limit is invalid.");
  }
  const status = url.searchParams.get("status");
  if (status && !INTENT_STATUSES.includes(status as PaymentIntentStatus)) paymentError("VALIDATION_ERROR", "status is invalid.");
  const organizationId = url.searchParams.get("organizationId");
  return {
    cursor: boundedCursor(url.searchParams.get("cursor")),
    limit,
    organizationId: organizationId ? paymentId(organizationId, "organizationId") : undefined,
    status: status as PaymentIntentStatus | undefined,
  };
}

export function parseRefundListQuery(url: URL) {
  assertQuery(url.searchParams, ["cursor", "limit", "organizationId", "status"]);
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue === null ? undefined : Number(limitValue);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    paymentError("VALIDATION_ERROR", "limit is invalid.");
  }
  const status = url.searchParams.get("status");
  if (status && !REFUND_STATUSES.includes(status as PaymentRefundStatus)) paymentError("VALIDATION_ERROR", "status is invalid.");
  const organizationId = url.searchParams.get("organizationId");
  return {
    cursor: boundedCursor(url.searchParams.get("cursor")),
    limit,
    organizationId: organizationId ? paymentId(organizationId, "organizationId") : undefined,
    status: status as PaymentRefundStatus | undefined,
  };
}

export function parseCapabilityQuery(url: URL) {
  assertQuery(url.searchParams, ["targetId", "targetType"]);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");
  if (!targetType && !targetId) return undefined;
  if (!targetId || (targetType !== "CART" && targetType !== "ORDER" && targetType !== "BOOKING")) {
    paymentError("VALIDATION_ERROR", "Capability target is invalid.");
  }
  return { targetId: paymentId(targetId, "targetId"), targetType: targetType as "CART" | "ORDER" | "BOOKING" };
}

export async function readBoundedWebhook(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > 64 * 1024)) {
    paymentError("VALIDATION_ERROR", "Webhook body is too large.");
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > 64 * 1024) paymentError("VALIDATION_ERROR", "Webhook body is invalid.");
  const signatures = request.headers.get("x-payment-signature");
  const timestamps = request.headers.get("x-payment-timestamp");
  if (signatures?.includes(",") || timestamps?.includes(",")) {
    paymentError("WEBHOOK_INVALID_SIGNATURE", "Payment webhook could not be verified.");
  }
  return { body, receivedAt: new Date(), signature: signatures, timestamp: timestamps };
}

async function readJson(request: Request, allowed: readonly string[]) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") paymentError("VALIDATION_ERROR", "Content-Type must be application/json.");
  const declared = request.headers.get("content-length");
  if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > 16 * 1024)) {
    paymentError("VALIDATION_ERROR", "Request body is too large.");
  }
  let value: unknown;
  try {
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > 16 * 1024) paymentError("VALIDATION_ERROR", "Request body is invalid.");
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    paymentError("VALIDATION_ERROR", "Request body must be JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) paymentError("VALIDATION_ERROR", "Request body must be an object.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key))) paymentError("VALIDATION_ERROR", "Request body contains unknown fields.");
  return body;
}

function queryLimit(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) paymentError("VALIDATION_ERROR", "limit is invalid.");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > 50) paymentError("VALIDATION_ERROR", "limit is invalid.");
  return limit;
}

function paymentDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) {
    paymentError("VALIDATION_ERROR", field + " must be an ISO UTC timestamp.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) paymentError("VALIDATION_ERROR", field + " is invalid.");
  return date;
}

function assertQuery(params: URLSearchParams, allowed: readonly string[]): void {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) paymentError("VALIDATION_ERROR", "Query parameters are invalid.");
  }
}

function boundedCursor(value: string | null): string | undefined {
  if (!value) return undefined;
  if (value.length > 3_000 || !/^[A-Za-z0-9_-]+$/.test(value)) paymentError("INVALID_CURSOR", "Payment cursor is invalid.");
  return value;
}
