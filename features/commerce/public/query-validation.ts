import { Prisma } from "@prisma/client";

import { assertIqdAmount, decimalString } from "@/features/commerce/domain/money";
import { publicQueryFingerprint } from "@/features/commerce/public/cursor";
import { publicCommerceError } from "@/features/commerce/public/errors";
import { normalizePublicCommerceSearch } from "@/features/commerce/public/search-normalization";

export const DEFAULT_PUBLIC_LIMIT = 20;
export const MAX_PUBLIC_LIMIT = 50;
export const MAX_PUBLIC_QUERY_LENGTH = 100;

export type StoreSort = "newest" | "name_asc";
export type ProductSort = "newest" | "name_asc" | "price_asc" | "price_desc";
export type FulfillmentFilter = "delivery" | "pickup";

export interface StoreCollectionQuery {
  category?: string;
  cursor?: string;
  fingerprint: string;
  fulfillment?: FulfillmentFilter;
  limit: number;
  query?: string;
  sort: StoreSort;
}

export interface ProductCollectionQuery {
  category?: string;
  cursor?: string;
  fingerprint: string;
  inStock?: boolean;
  limit: number;
  maxPrice?: string;
  minPrice?: string;
  query?: string;
  sort: ProductSort;
  store?: string;
}

const STORE_PARAMETERS = new Set(["q", "category", "fulfillment", "sort", "cursor", "limit"]);
const PRODUCT_PARAMETERS = new Set([
  "q",
  "store",
  "category",
  "inStock",
  "minPrice",
  "maxPrice",
  "sort",
  "cursor",
  "limit",
]);

export function parseStoreCollectionQuery(params: URLSearchParams): StoreCollectionQuery {
  assertOnlySupportedParameters(params, STORE_PARAMETERS);
  const query = parseQuery(params);
  const category = parseSlug(params, "category");
  const fulfillment = parseEnum(params, "fulfillment", ["delivery", "pickup"] as const);
  const sort = parseEnum(params, "sort", ["newest", "name_asc"] as const) ?? "newest";
  const limit = parseLimit(params);
  const cursor = parseCursorValue(params);
  const fingerprint = publicQueryFingerprint({ category, fulfillment, q: query, scope: "stores", sort });
  return { category, cursor, fingerprint, fulfillment, limit, query, sort };
}

export function parseProductCollectionQuery(
  params: URLSearchParams,
  options: { fixedStore?: string } = {},
): ProductCollectionQuery {
  assertOnlySupportedParameters(params, PRODUCT_PARAMETERS, options.fixedStore ? new Set(["store"]) : undefined);
  const query = parseQuery(params);
  const requestedStore = parseSlug(params, "store");
  if (options.fixedStore && requestedStore) invalidQuery("The store parameter is not allowed on this route.");
  const store = options.fixedStore ?? requestedStore;
  const category = parseSlug(params, "category");
  const inStock = parseBoolean(params, "inStock");
  const minPrice = parsePrice(params, "minPrice");
  const maxPrice = parsePrice(params, "maxPrice");
  if (minPrice && maxPrice && new Prisma.Decimal(minPrice).greaterThan(maxPrice)) {
    invalidQuery("minPrice must not exceed maxPrice.");
  }
  const sort =
    parseEnum(params, "sort", ["newest", "name_asc", "price_asc", "price_desc"] as const) ??
    "newest";
  const limit = parseLimit(params);
  const cursor = parseCursorValue(params);
  const fingerprint = publicQueryFingerprint({
    category,
    inStock: inStock ?? null,
    maxPrice,
    minPrice,
    q: query,
    scope: options.fixedStore ? `store:${options.fixedStore}` : "products",
    sort,
    store,
  });
  return { category, cursor, fingerprint, inStock, limit, maxPrice, minPrice, query, sort, store };
}

export function parsePublicSlug(value: string, name: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    invalidQuery(`${name} is invalid.`);
  }
  return normalized;
}

function parseQuery(params: URLSearchParams) {
  const value = singleValue(params, "q")?.trim();
  if (!value) return undefined;
  if (value.length > MAX_PUBLIC_QUERY_LENGTH) invalidQuery("q must not exceed 100 characters.");
  return normalizePublicCommerceSearch(value) || undefined;
}

function parseLimit(params: URLSearchParams) {
  const value = singleValue(params, "limit");
  if (value === undefined) return DEFAULT_PUBLIC_LIMIT;
  if (!/^[0-9]+$/.test(value)) invalidQuery("limit must be an integer.");
  const limit = Number(value);
  if (limit < 1 || limit > MAX_PUBLIC_LIMIT) invalidQuery("limit must be between 1 and 50.");
  return limit;
}

function parseCursorValue(params: URLSearchParams) {
  const value = singleValue(params, "cursor")?.trim();
  if (!value) return undefined;
  if (value.length > 2048) invalidQuery("cursor is too long.");
  return value;
}

function parseSlug(params: URLSearchParams, name: string) {
  const value = singleValue(params, name)?.trim().toLowerCase();
  if (!value) return undefined;
  if (value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    invalidQuery(`${name} is invalid.`);
  }
  return value;
}

function parseBoolean(params: URLSearchParams, name: string) {
  const value = singleValue(params, name);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return invalidQuery(`${name} must be true or false.`);
}

function parsePrice(params: URLSearchParams, name: string) {
  const value = singleValue(params, name)?.trim();
  if (!value) return undefined;
  try {
    return decimalString(assertIqdAmount(value, name, { allowZero: true }));
  } catch {
    return invalidQuery(`${name} must be a nonnegative whole IQD decimal string.`);
  }
}

function parseEnum<const T extends readonly string[]>(params: URLSearchParams, name: string, values: T) {
  const value = singleValue(params, name)?.trim();
  if (!value) return undefined;
  if (!values.includes(value)) invalidQuery(`${name} is not supported.`);
  return value as T[number];
}

function singleValue(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  if (values.length > 1) invalidQuery(`${name} must be provided at most once.`);
  return values[0];
}

function assertOnlySupportedParameters(
  params: URLSearchParams,
  supported: ReadonlySet<string>,
  additionallyForbidden?: ReadonlySet<string>,
) {
  for (const name of params.keys()) {
    if (!supported.has(name) || additionallyForbidden?.has(name)) invalidQuery(`Unsupported query parameter: ${name}.`);
  }
}

function invalidQuery(message: string): never {
  return publicCommerceError("INVALID_QUERY", 400, message);
}
