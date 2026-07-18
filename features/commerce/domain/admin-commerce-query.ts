import type {
  CommerceOrderStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  MarketplaceCategoryStatus,
  PaymentStatus,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from "@prisma/client";

import { parseCanonicalInstant } from "@/features/commerce/domain/admin-commerce";
import { commerceError } from "@/features/commerce/domain/errors";

export type AdminPageSearchParams = Record<string, string | string[] | undefined>;

export const ADMIN_CATEGORY_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const satisfies readonly MarketplaceCategoryStatus[];
export const ADMIN_PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED"] as const satisfies readonly ProductStatus[];
export const ADMIN_VARIANT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const satisfies readonly ProductVariantStatus[];
export const ADMIN_STORE_STATUSES = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "REJECTED", "SUSPENDED", "ARCHIVED"] as const satisfies readonly StoreStatus[];
export const ADMIN_ORDER_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"] as const satisfies readonly CommerceOrderStatus[];
export const ADMIN_FULFILLMENT_STATUSES = ["UNFULFILLED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "DELIVERY_FAILED", "CANCELLED"] as const satisfies readonly FulfillmentStatus[];
export const ADMIN_PAYMENT_STATUSES = ["UNPAID", "PAID", "VOIDED"] as const satisfies readonly PaymentStatus[];
export const ADMIN_FULFILLMENT_METHODS = ["STORE_DELIVERY", "CUSTOMER_PICKUP"] as const satisfies readonly FulfillmentMethod[];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdminCategoryPageQuery {
  cursor?: string;
  q?: string;
  status?: MarketplaceCategoryStatus;
}

export interface AdminStorePageQuery {
  cursor?: string;
  publicVisible?: boolean;
  q?: string;
  readinessIssue?: boolean;
  status?: StoreStatus;
  submittedFrom?: Date;
  submittedTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
}

export interface AdminProductPageQuery {
  categoryId?: string;
  cursor?: string;
  q?: string;
  readinessIssue?: boolean;
  status?: ProductStatus;
  storeStatus?: StoreStatus;
  unsafeMedia?: boolean;
  updatedFrom?: Date;
  updatedTo?: Date;
}

export interface AdminInventoryPageQuery {
  availability?: "in_stock" | "out_of_stock";
  cursor?: string;
  lowStock?: boolean;
  organizationId?: string;
  productStatus?: ProductStatus;
  q?: string;
  reserved?: boolean;
  storeId?: string;
  variantStatus?: ProductVariantStatus;
}

export interface AdminOrderPageQuery {
  createdFrom?: Date;
  createdTo?: Date;
  cursor?: string;
  deliveryFailure?: boolean;
  fulfillment?: FulfillmentStatus;
  fulfillmentMethod?: FulfillmentMethod;
  organizationId?: string;
  overdue?: boolean;
  payment?: PaymentStatus;
  q?: string;
  status?: CommerceOrderStatus;
  storeId?: string;
  updatedFrom?: Date;
  updatedTo?: Date;
}

export interface AdminAuditPageQuery {
  action?: string;
  adminUserId?: string;
  cursor?: string;
  from?: Date;
  targetId?: string;
  targetType?: string;
  to?: Date;
}

export function parseAdminCategoryPageQuery(params: AdminPageSearchParams): AdminCategoryPageQuery {
  assertOnly(params, ["cursor", "q", "status"]);
  return {
    cursor: cursorValue(params, "cursor"),
    q: textValue(params, "q", 120),
    status: enumValue(params, "status", ADMIN_CATEGORY_STATUSES),
  };
}

export function parseAdminStorePageQuery(params: AdminPageSearchParams): AdminStorePageQuery {
  assertOnly(params, ["cursor", "publicVisible", "q", "readinessIssue", "status", "submittedFrom", "submittedTo", "updatedFrom", "updatedTo"]);
  return {
    cursor: cursorValue(params, "cursor"),
    publicVisible: booleanValue(params, "publicVisible"),
    q: textValue(params, "q", 120),
    readinessIssue: booleanValue(params, "readinessIssue"),
    status: enumValue(params, "status", ADMIN_STORE_STATUSES),
    submittedFrom: instantValue(params, "submittedFrom"),
    submittedTo: instantValue(params, "submittedTo"),
    updatedFrom: instantValue(params, "updatedFrom"),
    updatedTo: instantValue(params, "updatedTo"),
  };
}

export function parseAdminProductPageQuery(params: AdminPageSearchParams): AdminProductPageQuery {
  assertOnly(params, ["categoryId", "cursor", "q", "readinessIssue", "status", "storeStatus", "unsafeMedia", "updatedFrom", "updatedTo"]);
  return {
    categoryId: uuidValue(params, "categoryId"),
    cursor: cursorValue(params, "cursor"),
    q: textValue(params, "q", 120),
    readinessIssue: booleanValue(params, "readinessIssue"),
    status: enumValue(params, "status", ADMIN_PRODUCT_STATUSES),
    storeStatus: enumValue(params, "storeStatus", ADMIN_STORE_STATUSES),
    unsafeMedia: booleanValue(params, "unsafeMedia"),
    updatedFrom: instantValue(params, "updatedFrom"),
    updatedTo: instantValue(params, "updatedTo"),
  };
}

export function parseAdminInventoryPageQuery(params: AdminPageSearchParams): AdminInventoryPageQuery {
  assertOnly(params, ["availability", "cursor", "lowStock", "organizationId", "productStatus", "q", "reserved", "storeId", "variantStatus"]);
  return {
    availability: enumValue(params, "availability", ["in_stock", "out_of_stock"] as const),
    cursor: cursorValue(params, "cursor"),
    lowStock: booleanValue(params, "lowStock"),
    organizationId: uuidValue(params, "organizationId"),
    productStatus: enumValue(params, "productStatus", ADMIN_PRODUCT_STATUSES),
    q: textValue(params, "q", 120),
    reserved: booleanValue(params, "reserved"),
    storeId: uuidValue(params, "storeId"),
    variantStatus: enumValue(params, "variantStatus", ADMIN_VARIANT_STATUSES),
  };
}

export function parseAdminOrderPageQuery(params: AdminPageSearchParams): AdminOrderPageQuery {
  assertOnly(params, [
    "createdFrom", "createdTo", "cursor", "deliveryFailure", "fulfillment", "fulfillmentMethod",
    "organizationId", "overdue", "payment", "q", "status", "storeId", "updatedFrom", "updatedTo",
  ]);
  return {
    createdFrom: instantValue(params, "createdFrom"),
    createdTo: instantValue(params, "createdTo"),
    cursor: cursorValue(params, "cursor"),
    deliveryFailure: booleanValue(params, "deliveryFailure"),
    fulfillment: enumValue(params, "fulfillment", ADMIN_FULFILLMENT_STATUSES),
    fulfillmentMethod: enumValue(params, "fulfillmentMethod", ADMIN_FULFILLMENT_METHODS),
    organizationId: uuidValue(params, "organizationId"),
    overdue: booleanValue(params, "overdue"),
    payment: enumValue(params, "payment", ADMIN_PAYMENT_STATUSES),
    q: textValue(params, "q", 120),
    status: enumValue(params, "status", ADMIN_ORDER_STATUSES),
    storeId: uuidValue(params, "storeId"),
    updatedFrom: instantValue(params, "updatedFrom"),
    updatedTo: instantValue(params, "updatedTo"),
  };
}

export function parseAdminAuditPageQuery(params: AdminPageSearchParams): AdminAuditPageQuery {
  assertOnly(params, ["action", "adminUserId", "cursor", "from", "targetId", "targetType", "to"]);
  return {
    action: textValue(params, "action", 120),
    adminUserId: textValue(params, "adminUserId", 200),
    cursor: cursorValue(params, "cursor"),
    from: instantValue(params, "from"),
    targetId: uuidValue(params, "targetId"),
    targetType: textValue(params, "targetType", 80),
    to: instantValue(params, "to"),
  };
}

export function parseAdminDetailCursor(params: AdminPageSearchParams, name: "auditCursor" | "cursor") {
  assertOnly(params, [name]);
  return cursorValue(params, name);
}

export function adminCategoryNextHref(query: AdminCategoryPageQuery, cursor: string) {
  return nextHref("/admin/commerce/categories", cursor, [["q", query.q], ["status", query.status]]);
}

export function adminStoreNextHref(query: AdminStorePageQuery, cursor: string) {
  return nextHref("/admin/commerce/stores", cursor, [
    ["q", query.q], ["status", query.status], ["readinessIssue", query.readinessIssue], ["publicVisible", query.publicVisible],
    ["submittedFrom", query.submittedFrom], ["submittedTo", query.submittedTo], ["updatedFrom", query.updatedFrom], ["updatedTo", query.updatedTo],
  ]);
}

export function adminProductNextHref(query: AdminProductPageQuery, cursor: string) {
  return nextHref("/admin/commerce/products", cursor, [
    ["q", query.q], ["status", query.status], ["storeStatus", query.storeStatus], ["categoryId", query.categoryId],
    ["readinessIssue", query.readinessIssue], ["unsafeMedia", query.unsafeMedia],
    ["updatedFrom", query.updatedFrom], ["updatedTo", query.updatedTo],
  ]);
}

export function adminInventoryNextHref(query: AdminInventoryPageQuery, cursor: string) {
  return nextHref("/admin/commerce/inventory", cursor, [
    ["q", query.q], ["availability", query.availability], ["lowStock", query.lowStock], ["reserved", query.reserved],
    ["organizationId", query.organizationId], ["storeId", query.storeId], ["productStatus", query.productStatus],
    ["variantStatus", query.variantStatus],
  ]);
}

export function adminOrderNextHref(query: AdminOrderPageQuery, cursor: string) {
  return nextHref("/admin/commerce/orders", cursor, [
    ["q", query.q], ["status", query.status], ["fulfillment", query.fulfillment], ["payment", query.payment],
    ["fulfillmentMethod", query.fulfillmentMethod], ["organizationId", query.organizationId], ["storeId", query.storeId],
    ["overdue", query.overdue], ["deliveryFailure", query.deliveryFailure],
    ["createdFrom", query.createdFrom], ["createdTo", query.createdTo], ["updatedFrom", query.updatedFrom], ["updatedTo", query.updatedTo],
  ]);
}

export function adminAuditNextHref(query: AdminAuditPageQuery, cursor: string) {
  return nextHref("/admin/commerce/audit", cursor, [
    ["action", query.action], ["targetType", query.targetType], ["targetId", query.targetId],
    ["adminUserId", query.adminUserId], ["from", query.from], ["to", query.to],
  ]);
}

export function adminInventoryMovementNextHref(inventoryItemId: string, cursor: string) {
  return nextHref(`/admin/commerce/inventory/${inventoryItemId}`, cursor, [], "cursor");
}

export function adminStoreAuditNextHref(storeId: string, cursor: string) {
  return nextHref(`/admin/commerce/stores/${storeId}`, cursor, [], "auditCursor");
}

type QueryValue = boolean | Date | string | undefined;

function nextHref(pathname: string, cursor: string, values: readonly (readonly [string, QueryValue])[], cursorName = "cursor") {
  const output = new URLSearchParams();
  for (const [name, value] of values) setQueryValue(output, name, value);
  output.set(cursorName, cursor);
  return `${pathname}?${output}`;
}

function setQueryValue(params: URLSearchParams, name: string, value: QueryValue) {
  if (value === undefined) return;
  params.set(name, value instanceof Date ? value.toISOString() : String(value));
}

function assertOnly(params: AdminPageSearchParams, allowed: readonly string[]) {
  const names = new Set(allowed);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && !names.has(name)) commerceError("VALIDATION_ERROR", `Unknown Admin Commerce filter: ${name}.`);
  }
}

function singleValue(params: AdminPageSearchParams, name: string) {
  const value = params[name];
  if (Array.isArray(value)) commerceError("VALIDATION_ERROR", `${name} must be supplied exactly once.`);
  return value;
}

function textValue(params: AdminPageSearchParams, name: string, maximum: number) {
  const value = singleValue(params, name);
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) commerceError("VALIDATION_ERROR", `${name} is invalid.`);
  return normalized;
}

function cursorValue(params: AdminPageSearchParams, name: string) {
  const value = singleValue(params, name);
  if (value === undefined) return undefined;
  if (!value || value.length > 3_000) commerceError("INVALID_CURSOR", "Admin Commerce cursor is malformed.");
  return value;
}

function booleanValue(params: AdminPageSearchParams, name: string) {
  const value = singleValue(params, name);
  if (value === undefined || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  commerceError("VALIDATION_ERROR", `${name} must be true or false.`);
}

function enumValue<const T extends readonly string[]>(params: AdminPageSearchParams, name: string, values: T): T[number] | undefined {
  const value = singleValue(params, name);
  if (value === undefined || value === "") return undefined;
  if (!(values as readonly string[]).includes(value)) commerceError("VALIDATION_ERROR", `${name} has an unsupported value.`);
  return value as T[number];
}

function uuidValue(params: AdminPageSearchParams, name: string) {
  const value = singleValue(params, name);
  if (value === undefined || value === "") return undefined;
  if (!UUID_PATTERN.test(value)) commerceError("VALIDATION_ERROR", `${name} must be a UUID.`);
  return value;
}

function instantValue(params: AdminPageSearchParams, name: string) {
  const value = singleValue(params, name);
  return parseCanonicalInstant(value, name);
}
