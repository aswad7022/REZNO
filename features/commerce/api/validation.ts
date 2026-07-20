import { MAX_CART_ITEM_QUANTITY } from "@/features/commerce/domain/cart";
import {
  merchantOrderDateRangeError,
  parseCanonicalMerchantOrderTimestamp,
} from "@/features/commerce/domain/merchant-order-filter-policy";
import { publicQueryFingerprint } from "@/features/commerce/public/cursor";
import { commerceApiError } from "@/features/commerce/api/errors";
import type { CustomerAddressInput } from "@/features/commerce/services/customer-service";
import type { MerchantInventoryQuery } from "@/features/commerce/services/merchant-inventory-service";
import type { MerchantOrderQuery } from "@/features/commerce/services/merchant-order-query-service";
import type { CustomerOrderQuery } from "@/features/commerce/services/customer-order-query-service";
import type { FavoriteQuery } from "@/features/commerce/services/customer-favorite-service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

export async function readJsonObject(request: Request, allowed: readonly string[]) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return commerceApiError("INVALID_REQUEST", 400, "A valid JSON object is required.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return commerceApiError("INVALID_REQUEST", 400, "A valid JSON object is required.");
  }
  const body = value as JsonObject;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) commerceApiError("INVALID_REQUEST", 400, `Unsupported field: ${key}.`);
  }
  return body;
}

export function parseUuid(value: unknown, name: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    return commerceApiError("INVALID_REQUEST", 400, `${name} must be a UUID.`);
  }
  return value.trim().toLowerCase();
}

export function parseRouteUuid(value: string, name: string) {
  return parseUuid(value, name);
}

function requiredString(value: unknown, name: string, max: number, min = 1) {
  if (typeof value !== "string") commerceApiError("INVALID_REQUEST", 400, `${name} is required.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    commerceApiError("INVALID_REQUEST", 400, `${name} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function optionalString(value: unknown, name: string, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") commerceApiError("INVALID_REQUEST", 400, `${name} must be text.`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) commerceApiError("INVALID_REQUEST", 400, `${name} is too long.`);
  return normalized;
}

function optionalBoolean(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") commerceApiError("INVALID_REQUEST", 400, `${name} must be boolean.`);
  return value;
}

function coordinate(value: unknown, name: string, min: number, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && typeof value !== "string") {
    commerceApiError("INVALID_REQUEST", 400, `${name} is invalid.`);
  }
  const text = String(value).trim();
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || number > max || !/^-?\d+(?:\.\d{1,6})?$/.test(text)) {
    commerceApiError("INVALID_REQUEST", 400, `${name} is invalid.`);
  }
  return text;
}

function phone(value: unknown) {
  const result = requiredString(value, "phone", 30, 7);
  if (!/^\+?[0-9][0-9 ()-]{5,28}$/.test(result)) {
    commerceApiError("INVALID_REQUEST", 400, "phone is invalid.");
  }
  return result;
}

const ADDRESS_FIELDS = [
  "additionalDetails",
  "area",
  "city",
  "isDefault",
  "landmark",
  "latitude",
  "longitude",
  "phone",
  "recipientName",
  "street",
] as const;

export async function parseAddressCreate(request: Request): Promise<CustomerAddressInput> {
  const body = await readJsonObject(request, ADDRESS_FIELDS);
  const latitude = coordinate(body.latitude, "latitude", -90, 90);
  const longitude = coordinate(body.longitude, "longitude", -180, 180);
  if ((latitude === null) !== (longitude === null)) {
    commerceApiError("INVALID_REQUEST", 400, "latitude and longitude must be provided together.");
  }
  return {
    additionalDetails: requiredString(body.additionalDetails, "additionalDetails", 500),
    area: requiredString(body.area, "area", 160),
    city: requiredString(body.city, "city", 160),
    isDefault: optionalBoolean(body.isDefault, "isDefault"),
    landmark: optionalString(body.landmark, "landmark", 240),
    latitude,
    longitude,
    phone: phone(body.phone),
    recipientName: requiredString(body.recipientName, "recipientName", 160),
    street: requiredString(body.street, "street", 240),
  };
}

export async function parseAddressUpdate(request: Request): Promise<Partial<CustomerAddressInput>> {
  const body = await readJsonObject(request, ADDRESS_FIELDS);
  if (Object.keys(body).length === 0) commerceApiError("INVALID_REQUEST", 400, "At least one field is required.");
  const result: Partial<CustomerAddressInput> = {};
  if ("additionalDetails" in body) result.additionalDetails = requiredString(body.additionalDetails, "additionalDetails", 500);
  if ("area" in body) result.area = requiredString(body.area, "area", 160);
  if ("city" in body) result.city = requiredString(body.city, "city", 160);
  if ("isDefault" in body) result.isDefault = optionalBoolean(body.isDefault, "isDefault");
  if ("landmark" in body) result.landmark = optionalString(body.landmark, "landmark", 240);
  if ("phone" in body) result.phone = phone(body.phone);
  if ("recipientName" in body) result.recipientName = requiredString(body.recipientName, "recipientName", 160);
  if ("street" in body) result.street = requiredString(body.street, "street", 240);
  const hasLatitude = "latitude" in body;
  const hasLongitude = "longitude" in body;
  if (hasLatitude !== hasLongitude) {
    commerceApiError("INVALID_REQUEST", 400, "latitude and longitude must be updated together.");
  }
  if (hasLatitude) {
    result.latitude = coordinate(body.latitude, "latitude", -90, 90);
    result.longitude = coordinate(body.longitude, "longitude", -180, 180);
  }
  return result;
}

export function parseQuantity(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_CART_ITEM_QUANTITY) {
    commerceApiError(
      "INVALID_REQUEST",
      400,
      `quantity must be an integer between 1 and ${MAX_CART_ITEM_QUANTITY}.`,
    );
  }
  return value as number;
}

export function parseCartVersion(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) {
    commerceApiError("INVALID_REQUEST", 400, "cartVersion must be a positive integer.");
  }
  return value as number;
}

export async function parseAddCartItem(request: Request) {
  const body = await readJsonObject(request, ["variantId", "quantity", "cartVersion"]);
  return {
    expectedVersion: body.cartVersion === undefined ? undefined : parseCartVersion(body.cartVersion),
    quantity: parseQuantity(body.quantity),
    variantId: parseUuid(body.variantId, "variantId"),
  };
}

export async function parseCartItemUpdate(request: Request) {
  const body = await readJsonObject(request, ["quantity", "cartVersion"]);
  return { expectedVersion: parseCartVersion(body.cartVersion), quantity: parseQuantity(body.quantity) };
}

export async function parseCartVersionRequest(request: Request) {
  const body = await readJsonObject(request, ["cartVersion"]);
  return parseCartVersion(body.cartVersion);
}

export async function parseCartReplacement(request: Request) {
  const body = await readJsonObject(request, ["cartId", "cartVersion", "variantId", "quantity"]);
  return {
    cartId: parseUuid(body.cartId, "cartId"),
    expectedVersion: parseCartVersion(body.cartVersion),
    quantity: parseQuantity(body.quantity),
    variantId: parseUuid(body.variantId, "variantId"),
  };
}

export function normalizedCustomerInstructions(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") commerceApiError("INVALID_REQUEST", 400, "customerInstructions must be text.");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > 1000) commerceApiError("INVALID_REQUEST", 400, "customerInstructions is too long.");
  return normalized;
}

export async function parseCheckoutRequest(request: Request) {
  const body = await readJsonObject(request, [
    "cartId",
    "cartVersion",
    "fulfillmentMethod",
    "addressId",
    "customerInstructions",
    "paymentMethod",
  ]);
  const fulfillmentMethod = body.fulfillmentMethod;
  if (fulfillmentMethod !== "STORE_DELIVERY" && fulfillmentMethod !== "CUSTOMER_PICKUP") {
    commerceApiError("INVALID_REQUEST", 400, "fulfillmentMethod is invalid.");
  }
  const addressId = body.addressId === undefined || body.addressId === null ? null : parseUuid(body.addressId, "addressId");
  const paymentMethod = body.paymentMethod;
  if (paymentMethod !== undefined && paymentMethod !== "ONLINE_PROVIDER") {
    commerceApiError("INVALID_REQUEST", 400, "paymentMethod is invalid.");
  }
  if (fulfillmentMethod === "STORE_DELIVERY" && !addressId) {
    commerceApiError("ADDRESS_REQUIRED", 400, "Delivery requires an address.");
  }
  if (fulfillmentMethod === "CUSTOMER_PICKUP" && addressId) {
    commerceApiError("ADDRESS_NOT_ALLOWED", 400, "Pickup must not include an address.");
  }
  return {
    addressId,
    cartId: parseUuid(body.cartId, "cartId"),
    cartVersion: parseCartVersion(body.cartVersion),
    customerInstructions: normalizedCustomerInstructions(body.customerInstructions),
    fulfillmentMethod: fulfillmentMethod as "STORE_DELIVERY" | "CUSTOMER_PICKUP",
    paymentMethod: paymentMethod as "ONLINE_PROVIDER" | undefined,
  };
}

export function parseIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) commerceApiError("IDEMPOTENCY_KEY_REQUIRED", 400, "Idempotency-Key is required.");
  if (value.includes(",") || !UUID_PATTERN.test(value)) {
    commerceApiError("INVALID_REQUEST", 400, "Idempotency-Key must be one UUID.");
  }
  return value.toLowerCase();
}

export function parseMerchantInventoryQuery(params: URLSearchParams): MerchantInventoryQuery {
  const supported = new Set([
    "q", "cursor", "limit", "availability", "lowStock", "productStatus", "variantStatus",
  ]);
  for (const key of params.keys()) {
    if (!supported.has(key) || params.getAll(key).length !== 1) {
      commerceApiError("INVALID_REQUEST", 400, `Unsupported or duplicate query parameter: ${key}.`);
    }
  }
  const query = params.get("q")?.trim();
  if (query && query.length > 100) commerceApiError("INVALID_REQUEST", 400, "q is too long.");
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) {
    commerceApiError("INVALID_REQUEST", 400, "limit must be between 1 and 50.");
  }
  const availability = params.get("availability") || undefined;
  if (availability !== undefined && availability !== "in_stock" && availability !== "out_of_stock") {
    commerceApiError("INVALID_REQUEST", 400, "availability is invalid.");
  }
  const cursor = params.get("cursor")?.trim() || undefined;
  if (cursor && cursor.length > 2048) commerceApiError("INVALID_REQUEST", 400, "cursor is too long.");
  const normalizedQuery = query?.toLocaleLowerCase() || undefined;
  const lowStockValue = params.get("lowStock");
  if (lowStockValue !== null && lowStockValue !== "true" && lowStockValue !== "false") {
    commerceApiError("INVALID_REQUEST", 400, "lowStock is invalid.");
  }
  const productStatus = optionalEnum(params.get("productStatus"), "productStatus", [
    "DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED",
  ] as const);
  const variantStatus = optionalEnum(params.get("variantStatus"), "variantStatus", [
    "ACTIVE", "INACTIVE", "ARCHIVED",
  ] as const);
  return {
    availability,
    cursor,
    fingerprint: publicQueryFingerprint({
      availability,
      lowStock: lowStockValue ?? undefined,
      productStatus,
      q: normalizedQuery,
      scope: "merchant-inventory",
      variantStatus,
    }),
    limit,
    lowStock: lowStockValue === null ? undefined : lowStockValue === "true",
    productStatus,
    query: normalizedQuery,
    variantStatus,
  };
}

export function parseMerchantOrderQuery(params: URLSearchParams): MerchantOrderQuery {
  assertUniqueQueryParameters(params, [
    "actionable", "createdFrom", "createdTo", "cursor", "fulfillmentMethod",
    "fulfillmentStatus", "limit", "overdue", "paymentStatus", "q", "queue",
    "status", "updatedFrom", "updatedTo",
  ]);
  const query = params.get("q")?.trim() || undefined;
  if (query && (query.length > 80 || !/^[\p{L}\p{N}-]+$/u.test(query))) {
    commerceApiError("INVALID_REQUEST", 400, "q is invalid.");
  }
  const result: MerchantOrderQuery = {
    actionableOnly: queryBoolean(params.get("actionable"), "actionable"),
    createdFrom: queryDate(params.get("createdFrom"), "createdFrom"),
    createdTo: queryDate(params.get("createdTo"), "createdTo"),
    cursor: boundedCursor(params.get("cursor")),
    fulfillmentMethod: optionalEnum(params.get("fulfillmentMethod"), "fulfillmentMethod", ["CUSTOMER_PICKUP", "STORE_DELIVERY"] as const),
    fulfillmentStatus: optionalEnum(params.get("fulfillmentStatus"), "fulfillmentStatus", ["UNFULFILLED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "DELIVERY_FAILED", "CANCELLED"] as const),
    limit: parseCollectionLimit(params.get("limit")),
    overduePending: queryBoolean(params.get("overdue"), "overdue"),
    paymentStatus: optionalEnum(params.get("paymentStatus"), "paymentStatus", ["UNPAID", "PAID", "VOIDED"] as const),
    query,
    queue: optionalEnum(params.get("queue"), "queue", ["pending", "active", "ready", "delivery_issues", "completed", "closed", "all"] as const) ?? "pending",
    status: optionalEnum(params.get("status"), "status", ["PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"] as const),
    updatedFrom: queryDate(params.get("updatedFrom"), "updatedFrom"),
    updatedTo: queryDate(params.get("updatedTo"), "updatedTo"),
  };
  for (const [from, to] of [[result.createdFrom, result.createdTo], [result.updatedFrom, result.updatedTo]]) {
    const error = merchantOrderDateRangeError(from, to);
    if (error === "ORDER") commerceApiError("INVALID_REQUEST", 400, "Order date range is invalid.");
    if (error === "TOO_WIDE") commerceApiError("INVALID_REQUEST", 400, "Order date range cannot exceed 366 days.");
  }
  return result;
}

export async function parseInventoryAdjustment(request: Request) {
  const body = await readJsonObject(request, ["delta", "expectedVersion", "reason", "operationKey"]);
  if (!Number.isSafeInteger(body.delta) || body.delta === 0 || Math.abs(body.delta as number) > 2_147_483_647) {
    commerceApiError("INVALID_REQUEST", 400, "delta must be a bounded nonzero integer.");
  }
  if (!Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 0 || (body.expectedVersion as number) > 2_147_483_647) {
    commerceApiError("INVALID_REQUEST", 400, "expectedVersion must be a bounded nonnegative integer.");
  }
  return {
    delta: body.delta as number,
    expectedVersion: body.expectedVersion as number,
    operationKey: parseUuid(body.operationKey, "operationKey"),
    reason: requiredString(body.reason, "reason", 500, 2).replace(/\s+/g, " "),
  };
}

export function parseCustomerOrderQuery(params: URLSearchParams): CustomerOrderQuery {
  assertUniqueQueryParameters(params, [
    "cursor",
    "limit",
    "status",
    "fulfillmentStatus",
    "paymentStatus",
    "fulfillmentMethod",
    "storeSlug",
    "sort",
  ]);
  return {
    cursor: boundedCursor(params.get("cursor")),
    fulfillmentMethod: optionalEnum(params.get("fulfillmentMethod"), "fulfillmentMethod", [
      "STORE_DELIVERY", "CUSTOMER_PICKUP",
    ] as const),
    fulfillmentStatus: optionalEnum(params.get("fulfillmentStatus"), "fulfillmentStatus", [
      "UNFULFILLED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY",
      "DELIVERED", "PICKED_UP", "DELIVERY_FAILED", "CANCELLED",
    ] as const),
    limit: parseCollectionLimit(params.get("limit")),
    paymentStatus: optionalEnum(params.get("paymentStatus"), "paymentStatus", [
      "UNPAID", "PAID", "VOIDED",
    ] as const),
    sort: optionalEnum(params.get("sort"), "sort", ["newest", "oldest"] as const) ?? "newest",
    status: optionalEnum(params.get("status"), "status", [
      "PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED",
    ] as const),
    storeSlug: params.get("storeSlug") === null
      ? undefined
      : requiredString(params.get("storeSlug"), "storeSlug", 160),
  };
}

export function parseFavoriteQuery(params: URLSearchParams): FavoriteQuery {
  assertUniqueQueryParameters(params, ["cursor", "limit"]);
  return {
    cursor: boundedCursor(params.get("cursor")),
    limit: parseCollectionLimit(params.get("limit")),
  };
}

export async function parseFavoriteTarget(request: Request, field: "productId" | "storeId") {
  const body = await readJsonObject(request, [field]);
  return parseUuid(body[field], field);
}

export async function parseCancellationRequest(request: Request) {
  const body = await readJsonObject(request, ["expectedVersion", "reason"]);
  if (typeof body.reason !== "string" || body.reason.trim().length < 2 || body.reason.trim().length > 500) {
    commerceApiError(
      "CANCELLATION_REASON_REQUIRED",
      400,
      "A cancellation reason between 2 and 500 characters is required.",
    );
  }
  if (typeof body.expectedVersion !== "string") {
    commerceApiError("INVALID_REQUEST", 400, "expectedVersion is required.");
  }
  const expectedVersion = new Date(body.expectedVersion);
  if (Number.isNaN(expectedVersion.getTime()) || expectedVersion.toISOString() !== body.expectedVersion) {
    commerceApiError("INVALID_REQUEST", 400, "expectedVersion must be an ISO timestamp.");
  }
  return { expectedVersion: body.expectedVersion, reason: body.reason.trim().replace(/\s+/g, " ") };
}

function assertUniqueQueryParameters(params: URLSearchParams, allowed: readonly string[]) {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      commerceApiError("INVALID_REQUEST", 400, `Unsupported or duplicate query parameter: ${key}.`);
    }
  }
}

function parseCollectionLimit(value: string | null) {
  if (value === null) return 20;
  if (!/^\d+$/.test(value)) commerceApiError("INVALID_REQUEST", 400, "limit is invalid.");
  const limit = Number(value);
  if (limit < 1 || limit > 50) commerceApiError("INVALID_REQUEST", 400, "limit must be between 1 and 50.");
  return limit;
}

function boundedCursor(value: string | null) {
  if (value === null) return undefined;
  const cursor = value.trim();
  if (!cursor || cursor.length > 2048) commerceApiError("INVALID_CURSOR", 400, "cursor is invalid.");
  return cursor;
}

function queryBoolean(value: string | null, name: string) {
  if (value === null) return undefined;
  if (value !== "true" && value !== "false") commerceApiError("INVALID_REQUEST", 400, `${name} is invalid.`);
  return value === "true";
}

function queryDate(value: string | null, name: string) {
  if (value === null) return undefined;
  const date = parseCanonicalMerchantOrderTimestamp(value);
  if (!date) commerceApiError("INVALID_REQUEST", 400, `${name} must be an ISO timestamp with a timezone.`);
  return date;
}

function optionalEnum<const T extends readonly string[]>(
  value: string | null,
  name: string,
  values: T,
): T[number] | undefined {
  if (value === null) return undefined;
  if (!values.includes(value)) commerceApiError("INVALID_REQUEST", 400, `${name} is invalid.`);
  return value as T[number];
}
