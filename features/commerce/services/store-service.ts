import type { Prisma } from "@prisma/client";

import { assertIqdAmount, COMMERCE_CURRENCY } from "@/features/commerce/domain/money";
import { assertStoreTransition } from "@/features/commerce/domain/store-lifecycle";
import { commerceError } from "@/features/commerce/domain/errors";
import {
  assertAdminPermission,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { runCommerceSerializable } from "@/features/commerce/services/transaction";

export interface MerchantIdentityInput {
  organizationId: string;
  personId: string;
}

export interface StoreDraftInput {
  coverImageUrl?: string | null;
  currency?: string;
  deliveryArea?: string | null;
  deliveryCity?: string | null;
  deliveryEnabled: boolean;
  deliveryEstimateMinutes?: number | null;
  deliveryFee?: string;
  description?: string | null;
  logoUrl?: string | null;
  minimumOrderValue?: string;
  name: string;
  pickupAdditionalDetails?: string | null;
  pickupArea?: string | null;
  pickupCity?: string | null;
  pickupEnabled: boolean;
  pickupInstructions?: string | null;
  pickupStreet?: string | null;
  preparationEstimateMinutes?: number | null;
  slug: string;
  supportPhone?: string | null;
}

function trimmed(value: string | null | undefined, max: number) {
  const result = value?.trim();
  if (!result) return null;
  if (result.length > max) commerceError("VALIDATION_ERROR", `Value exceeds ${max} characters.`);
  return result;
}

function validateStoreDraft(input: StoreDraftInput) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (name.length < 2 || name.length > 120) {
    commerceError("VALIDATION_ERROR", "Store name must be between 2 and 120 characters.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    commerceError("VALIDATION_ERROR", "Store slug is invalid.");
  }
  if ((input.currency ?? COMMERCE_CURRENCY) !== COMMERCE_CURRENCY) {
    commerceError("VALIDATION_ERROR", "Milestone 2A supports IQD only.");
  }
  const deliveryFee = assertIqdAmount(input.deliveryFee ?? "0", "deliveryFee", {
    allowZero: true,
  });
  const minimumOrderValue = assertIqdAmount(
    input.minimumOrderValue ?? "0",
    "minimumOrderValue",
    { allowZero: true },
  );
  for (const [field, value] of [
    ["preparationEstimateMinutes", input.preparationEstimateMinutes],
    ["deliveryEstimateMinutes", input.deliveryEstimateMinutes],
  ] as const) {
    if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 1 || value > 10080)) {
      commerceError("VALIDATION_ERROR", `${field} must be a positive bounded integer.`);
    }
  }
  return {
    coverImageUrl: trimmed(input.coverImageUrl, 2048),
    currency: COMMERCE_CURRENCY,
    deliveryArea: trimmed(input.deliveryArea, 160),
    deliveryCity: trimmed(input.deliveryCity, 160),
    deliveryEnabled: input.deliveryEnabled,
    deliveryEstimateMinutes: input.deliveryEstimateMinutes ?? null,
    deliveryFee,
    description: trimmed(input.description, 4000),
    logoUrl: trimmed(input.logoUrl, 2048),
    minimumOrderValue,
    name,
    pickupAdditionalDetails: trimmed(input.pickupAdditionalDetails, 500),
    pickupArea: trimmed(input.pickupArea, 160),
    pickupCity: trimmed(input.pickupCity, 160),
    pickupEnabled: input.pickupEnabled,
    pickupInstructions: trimmed(input.pickupInstructions, 1000),
    pickupStreet: trimmed(input.pickupStreet, 240),
    preparationEstimateMinutes: input.preparationEstimateMinutes ?? null,
    slug,
    supportPhone: trimmed(input.supportPhone, 30),
  };
}

export async function createStoreDraft(
  identity: MerchantIdentityInput,
  input: StoreDraftInput,
) {
  const data = validateStoreDraft(input);
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "STORE_MANAGE", transaction);
    const existing = await transaction.store.findUnique({
      where: { organizationId: context.organizationId },
      select: { id: true },
    });
    if (existing) commerceError("CONFLICT", "This Organization already owns a Store.");
    return transaction.store.create({
      data: { ...data, organization: { connect: { id: context.organizationId } } },
    });
  });
}

function assertStoreReadyForReview(store: {
  deliveryArea: string | null;
  deliveryCity: string | null;
  deliveryEnabled: boolean;
  pickupArea: string | null;
  pickupCity: string | null;
  pickupEnabled: boolean;
  pickupStreet: string | null;
}) {
  if (!store.deliveryEnabled && !store.pickupEnabled) {
    commerceError("VALIDATION_ERROR", "At least one fulfillment method is required.");
  }
  if (store.deliveryEnabled && (!store.deliveryCity || !store.deliveryArea)) {
    commerceError("VALIDATION_ERROR", "Delivery city and area are required.");
  }
  if (store.pickupEnabled && (!store.pickupCity || !store.pickupArea || !store.pickupStreet)) {
    commerceError("VALIDATION_ERROR", "Pickup address is incomplete.");
  }
}

export async function submitStoreForReview(identity: MerchantIdentityInput, storeId: string) {
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "STORE_MANAGE", transaction);
    const store = await transaction.store.findFirst({
      where: { id: storeId, organizationId: context.organizationId },
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    assertStoreTransition(store.status, "PENDING_REVIEW");
    assertStoreReadyForReview(store);
    const changed = await transaction.store.updateMany({
      where: { id: store.id, organizationId: context.organizationId, status: store.status },
      data: { status: "PENDING_REVIEW", submittedAt: new Date(), reviewReason: null },
    });
    if (changed.count !== 1) commerceError("CONFLICT", "Store changed concurrently.");
    return transaction.store.findUniqueOrThrow({ where: { id: store.id } });
  });
}

export async function reopenRejectedStoreDraft(
  identity: MerchantIdentityInput,
  storeId: string,
) {
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "STORE_MANAGE", transaction);
    const store = await transaction.store.findFirst({
      where: { id: storeId, organizationId: context.organizationId },
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    assertStoreTransition(store.status, "DRAFT");
    return transaction.store.update({
      where: { id: store.id },
      data: {
        reviewReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
        status: "DRAFT",
        submittedAt: null,
      },
    });
  });
}

export async function archiveStore(identity: MerchantIdentityInput, storeId: string, reason: string) {
  const normalizedReason = requiredReason(reason);
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "STORE_MANAGE", transaction);
    const store = await transaction.store.findFirst({
      where: { id: storeId, organizationId: context.organizationId },
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    assertStoreTransition(store.status, "ARCHIVED");
    const activeOrders = await transaction.order.count({
      where: {
        storeId: store.id,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (activeOrders > 0) {
      commerceError("CONFLICT", "Store with active Orders cannot be archived.");
    }
    return transaction.store.update({
      where: { id: store.id },
      data: { archiveReason: normalizedReason, archivedAt: new Date(), status: "ARCHIVED" },
    });
  });
}

async function recordStoreAdminAudit(
  transaction: Prisma.TransactionClient,
  context: CommerceAdminContext,
  action: string,
  storeId: string,
  reason?: string,
) {
  await transaction.adminAuditLog.create({
    data: {
      action,
      adminUserId: context.userId,
      metadata: reason ? { reason } : undefined,
      targetId: storeId,
      targetType: "Store",
    },
  });
}

export async function approveStore(context: CommerceAdminContext, storeId: string) {
  assertAdminPermission(context, "COMMERCE_STORES_REVIEW");
  return runCommerceSerializable(async (transaction) => {
    const store = await transaction.store.findUnique({ where: { id: storeId } });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    assertStoreTransition(store.status, "ACTIVE");
    const now = new Date();
    await transaction.store.update({
      where: { id: store.id },
      data: {
        publishedAt: store.publishedAt ?? now,
        reviewReason: null,
        reviewedAt: now,
        reviewedByUserId: context.userId,
        status: "ACTIVE",
        suspensionReason: null,
        suspendedAt: null,
      },
    });
    await recordStoreAdminAudit(transaction, context, "commerce.store.approve", store.id);
    return transaction.store.findUniqueOrThrow({ where: { id: store.id } });
  });
}

export async function rejectStore(
  context: CommerceAdminContext,
  storeId: string,
  reason: string,
) {
  assertAdminPermission(context, "COMMERCE_STORES_REVIEW");
  const normalizedReason = requiredReason(reason);
  return changeStoreByAdmin(context, storeId, "REJECTED", "commerce.store.reject", normalizedReason);
}

export async function suspendStore(
  context: CommerceAdminContext,
  storeId: string,
  reason: string,
) {
  assertAdminPermission(context, "COMMERCE_STORES_REVIEW");
  const normalizedReason = requiredReason(reason);
  return changeStoreByAdmin(context, storeId, "SUSPENDED", "commerce.store.suspend", normalizedReason);
}

export async function reactivateStore(context: CommerceAdminContext, storeId: string) {
  assertAdminPermission(context, "COMMERCE_STORES_REVIEW");
  return changeStoreByAdmin(context, storeId, "ACTIVE", "commerce.store.reactivate");
}

async function changeStoreByAdmin(
  context: CommerceAdminContext,
  storeId: string,
  next: "ACTIVE" | "REJECTED" | "SUSPENDED",
  action: string,
  reason?: string,
) {
  return runCommerceSerializable(async (transaction) => {
    const store = await transaction.store.findUnique({ where: { id: storeId } });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    assertStoreTransition(store.status, next);
    const now = new Date();
    await transaction.store.update({
      where: { id: store.id },
      data: {
        publishedAt: next === "ACTIVE" ? store.publishedAt ?? now : store.publishedAt,
        reviewReason: next === "REJECTED" ? reason : null,
        reviewedAt: next === "REJECTED" ? now : store.reviewedAt,
        reviewedByUserId: next === "REJECTED" ? context.userId : store.reviewedByUserId,
        status: next,
        suspendedAt: next === "SUSPENDED" ? now : null,
        suspensionReason: next === "SUSPENDED" ? reason : null,
      },
    });
    await recordStoreAdminAudit(transaction, context, action, store.id, reason);
    return transaction.store.findUniqueOrThrow({ where: { id: store.id } });
  });
}

function requiredReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 2 || normalized.length > 1000) {
    commerceError("VALIDATION_ERROR", "A reason between 2 and 1000 characters is required.");
  }
  return normalized;
}
