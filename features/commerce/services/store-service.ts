import { Prisma, type StoreStatus } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { hashCheckoutRequest } from "@/features/commerce/domain/idempotency";
import { assertStoreTransition } from "@/features/commerce/domain/store-lifecycle";
import {
  adminStoreMutationSchema,
  archiveStoreSchema,
  createStoreSchema,
  storeLifecycleSchema,
  updateStoreSchema,
  type CreateStoreInput,
  type StoreProfileInput,
  type UpdateStoreInput,
} from "@/features/commerce/domain/store-input";
import {
  merchantReadOnlyStoreDto,
  merchantStoreInclude,
  ownerManagementStoreDto,
  storeReadiness,
  type MerchantStoreRecord,
} from "@/features/commerce/domain/store-dto";
import {
  assertCommerceAdminCurrent,
  assertMerchantCommerceContextCurrent,
  assertRenderedMerchantOrganization,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantActorReference,
  type MerchantCommerceContext,
} from "@/features/commerce/services/authorization";
import {
  assertCommerceExpectedVersion,
  mutationReplayTarget,
  recordMerchantMutation,
  resolveMerchantMutationReplay,
} from "@/features/commerce/services/merchant-mutation";
import { notifyStoreLifecycle } from "@/features/commerce/services/store-notification-service";
import {
  lockCommerceOrganization,
  lockStore,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";
import { sanitizeAuditValue } from "@/features/business-operations/domain/validation";
import { prisma } from "@/lib/db/prisma";

export type MerchantIdentityInput = MerchantActorReference;

type StoreLifecycleInput = {
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  storeId: string;
};

type AdminStoreMutationInput = {
  expectedVersion: string;
  idempotencyKey: string;
  reason: string | null;
  storeId: string;
};

export async function getMerchantStore(reference: MerchantActorReference) {
  const actor = await resolveMerchantCommerceContext(reference, "STORE_VIEW");
  const store = await prisma.store.findUnique({
    where: { organizationId: actor.organizationId },
    include: merchantStoreInclude,
  });
  if (!store) return { actor, store: null };
  return {
    actor,
    store: actor.systemRole === "OWNER"
      ? ownerManagementStoreDto(store)
      : merchantReadOnlyStoreDto(store),
  };
}

export async function createStoreDraft(
  reference: MerchantActorReference,
  input: CreateStoreInput,
) {
  const parsed = parse(createStoreSchema, input);
  const requestHash = hashCheckoutRequest({ action: "commerce.store.create", ...parsed });
  try {
    return await runCommerceSerializable(async (transaction) => {
      const actor = await resolveMerchantCommerceContext(reference, "STORE_MANAGE", transaction);
      requireOwner(actor);
      assertRenderedMerchantOrganization(actor, parsed.contextOrganizationId);
      const replay = await resolveMerchantMutationReplay(transaction, {
        actor,
        idempotencyKey: parsed.idempotencyKey,
        requestHash,
      });
      if (replay) return loadReplayStore(transaction, actor, replay);

      await lockCommerceOrganization(transaction, actor.organizationId);
      await assertMerchantCommerceContextCurrent(transaction, actor, "STORE_MANAGE");
      const existing = await transaction.store.findUnique({
        where: { organizationId: actor.organizationId },
        select: { id: true },
      });
      if (existing) commerceError("CONFLICT", "This Organization already owns a Store.");

      const store = await transaction.store.create({
        data: {
          ...storeProfileData(parsed),
          organizationId: actor.organizationId,
          status: "DRAFT",
        },
        include: merchantStoreInclude,
      });
      const result = ownerManagementStoreDto(store);
      await recordMerchantMutation(transaction, {
        action: "commerce.store.create",
        actor,
        after: auditStoreSnapshot(store),
        idempotencyKey: parsed.idempotencyKey,
        requestHash,
        result,
        resultVersion: store.updatedAt,
        targetId: store.id,
        targetType: "Store",
      });
      return ownerManagementStoreDto(store);
    });
  } catch (error) {
    mapStoreWriteError(error);
  }
}

export async function updateStoreProfile(
  reference: MerchantActorReference,
  input: UpdateStoreInput,
) {
  const parsed = parse(updateStoreSchema, input);
  const requestHash = hashCheckoutRequest({ action: "commerce.store.update", ...parsed });
  try {
    return await runCommerceSerializable(async (transaction) => {
      const actor = await resolveMerchantCommerceContext(reference, "STORE_MANAGE", transaction);
      requireOwner(actor);
      assertRenderedMerchantOrganization(actor, parsed.contextOrganizationId);
      const replay = await resolveMerchantMutationReplay(transaction, {
        actor,
        idempotencyKey: parsed.idempotencyKey,
        requestHash,
      });
      if (replay) return loadReplayStore(transaction, actor, replay, parsed.storeId);

      const store = await lockAndLoadMerchantStore(transaction, actor, parsed.storeId);
      assertCommerceExpectedVersion(store.updatedAt, parsed.expectedVersion);
      await assertMerchantCommerceContextCurrent(transaction, actor, "STORE_MANAGE");
      assertProfileEditable(store, parsed);
      const before = auditStoreSnapshot(store);
      const data = store.status === "ACTIVE"
        ? activeOperationalProfileData(parsed)
        : storeProfileData(parsed);
      const updated = await transaction.store.update({
        where: { id: store.id },
        data,
        include: merchantStoreInclude,
      });
      if (store.status === "ACTIVE") {
        const readiness = storeReadiness(updated);
        if (!readiness.ready) {
          commerceError(
            "VALIDATION_ERROR",
            "ACTIVE Store operational settings must remain review-ready.",
            { missing: readiness.missing },
          );
        }
      }
      await recordMerchantMutation(transaction, {
        action: "commerce.store.update",
        actor,
        after: auditStoreSnapshot(updated),
        before,
        idempotencyKey: parsed.idempotencyKey,
        requestHash,
        result: ownerManagementStoreDto(updated),
        resultVersion: updated.updatedAt,
        targetId: updated.id,
        targetType: "Store",
      });
      return ownerManagementStoreDto(updated);
    });
  } catch (error) {
    mapStoreWriteError(error);
  }
}

export async function submitStoreForReview(
  reference: MerchantActorReference,
  input: StoreLifecycleInput,
) {
  return merchantLifecycleMutation(reference, input, {
    action: "commerce.store.submit",
    next: "PENDING_REVIEW",
    notify: "store.submitted",
    update: (now) => ({ reviewReason: null, status: "PENDING_REVIEW", submittedAt: now }),
    validate: (store) => {
      const readiness = storeReadiness(store);
      if (!readiness.ready) {
        commerceError("VALIDATION_ERROR", "Store is not ready for review.", {
          missing: readiness.missing,
        });
      }
    },
  });
}

export async function reopenRejectedStoreDraft(
  reference: MerchantActorReference,
  input: StoreLifecycleInput,
) {
  return merchantLifecycleMutation(reference, input, {
    action: "commerce.store.reopen",
    next: "DRAFT",
    update: () => ({
      reviewReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      status: "DRAFT",
      submittedAt: null,
    }),
  });
}

export async function archiveStore(
  reference: MerchantActorReference,
  input: StoreLifecycleInput & { reason: string },
) {
  const parsed = parse(archiveStoreSchema, input);
  return merchantLifecycleMutation(reference, {
    contextOrganizationId: parsed.contextOrganizationId,
    expectedVersion: parsed.expectedVersion,
    idempotencyKey: parsed.idempotencyKey,
    storeId: parsed.storeId,
  }, {
    action: "commerce.store.archive",
    hashExtra: { reason: parsed.reason },
    next: "ARCHIVED",
    update: (now) => ({
      archiveReason: parsed.reason,
      archivedAt: now,
      status: "ARCHIVED",
    }),
    validate: async (store, transaction) => {
      const [activeOrders, activeReservations] = await Promise.all([
        transaction.order.count({
          where: { storeId: store.id, status: { in: ["PENDING", "CONFIRMED"] } },
        }),
        transaction.inventoryReservation.count({
          where: { productVariant: { storeId: store.id }, status: "ACTIVE" },
        }),
      ]);
      if (activeOrders > 0) {
        commerceError("CONFLICT", "Store with active Orders cannot be archived.");
      }
      if (activeReservations > 0) {
        commerceError("CONFLICT", "Store with active inventory reservations cannot be archived.");
      }
    },
  });
}

export async function approveStore(
  context: CommerceAdminContext,
  input: AdminStoreMutationInput,
) {
  return adminLifecycleMutation(context, input, "ACTIVE", "commerce.store.approve");
}

export async function rejectStore(
  context: CommerceAdminContext,
  input: AdminStoreMutationInput,
) {
  return adminLifecycleMutation(context, input, "REJECTED", "commerce.store.reject");
}

export async function suspendStore(
  context: CommerceAdminContext,
  input: AdminStoreMutationInput,
) {
  return adminLifecycleMutation(context, input, "SUSPENDED", "commerce.store.suspend");
}

export async function reactivateStore(
  context: CommerceAdminContext,
  input: AdminStoreMutationInput,
) {
  return adminLifecycleMutation(context, input, "ACTIVE", "commerce.store.reactivate");
}

async function merchantLifecycleMutation(
  reference: MerchantActorReference,
  rawInput: StoreLifecycleInput,
  policy: {
    action: string;
    hashExtra?: Readonly<Record<string, string>>;
    next: StoreStatus;
    notify?: "store.submitted";
    update: (now: Date) => Prisma.StoreUpdateInput;
    validate?: (
      store: MerchantStoreRecord,
      transaction: Prisma.TransactionClient,
    ) => void | Promise<void>;
  },
) {
  const input = parse(storeLifecycleSchema, rawInput);
  const requestHash = hashCheckoutRequest({ action: policy.action, ...input, ...policy.hashExtra });
  return runCommerceSerializable(async (transaction) => {
    const actor = await resolveMerchantCommerceContext(reference, "STORE_MANAGE", transaction);
    requireOwner(actor);
    assertRenderedMerchantOrganization(actor, input.contextOrganizationId);
    const replay = await resolveMerchantMutationReplay(transaction, {
      actor,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return loadReplayStore(transaction, actor, replay, input.storeId);

    const store = await lockAndLoadMerchantStore(transaction, actor, input.storeId);
    assertCommerceExpectedVersion(store.updatedAt, input.expectedVersion);
    await assertMerchantCommerceContextCurrent(transaction, actor, "STORE_MANAGE");
    assertStoreTransition(store.status, policy.next);
    await policy.validate?.(store, transaction);
    const updated = await transaction.store.update({
      where: { id: store.id },
      data: policy.update(new Date()),
      include: merchantStoreInclude,
    });
    await recordMerchantMutation(transaction, {
      action: policy.action,
      actor,
      after: auditStoreSnapshot(updated),
      before: auditStoreSnapshot(store),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: ownerManagementStoreDto(updated),
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Store",
    });
    if (policy.notify) {
      await notifyStoreLifecycle(transaction, {
        event: policy.notify,
        organizationId: actor.organizationId,
        resultVersion: updated.updatedAt,
        storeId: updated.id,
      });
    }
    return ownerManagementStoreDto(updated);
  });
}

async function adminLifecycleMutation(
  context: CommerceAdminContext,
  rawInput: AdminStoreMutationInput,
  next: "ACTIVE" | "REJECTED" | "SUSPENDED",
  action: string,
) {
  const input = parse(adminStoreMutationSchema, rawInput);
  const needsReason = next === "REJECTED" || next === "SUSPENDED";
  if (needsReason !== Boolean(input.reason)) {
    commerceError(
      "VALIDATION_ERROR",
      needsReason ? "A bounded reason is required." : "This action must not include a reason.",
    );
  }
  const requestHash = hashCheckoutRequest({ action, ...input });
  return runCommerceSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_STORES_REVIEW");
    const replay = await transaction.adminAuditLog.findUnique({
      where: {
        adminUserId_idempotencyKey: {
          adminUserId: context.userId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== requestHash || replay.targetId !== input.storeId) {
        commerceError("IDEMPOTENCY_CONFLICT", "The Admin idempotency key was already used.");
      }
      return loadAdminReplayStore(replay, input.storeId);
    }

    await lockStore(transaction, input.storeId);
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_STORES_REVIEW");
    const store = await transaction.store.findUnique({
      where: { id: input.storeId },
      include: merchantStoreInclude,
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    assertCommerceExpectedVersion(store.updatedAt, input.expectedVersion);
    assertStoreTransition(store.status, next);
    if (next === "ACTIVE") {
      const readiness = storeReadiness(store);
      if (!readiness.ready) {
        commerceError("VALIDATION_ERROR", "Store is not ready to become ACTIVE.", {
          missing: readiness.missing,
        });
      }
    }

    const now = new Date();
    const isApproval = store.status === "PENDING_REVIEW" && next === "ACTIVE";
    const updated = await transaction.store.update({
      where: { id: store.id },
      data: {
        publishedAt: next === "ACTIVE" ? store.publishedAt ?? now : store.publishedAt,
        reviewReason: next === "REJECTED" ? input.reason : null,
        reviewedAt: isApproval || next === "REJECTED" ? now : store.reviewedAt,
        reviewedByUserId: isApproval || next === "REJECTED" ? context.userId : store.reviewedByUserId,
        status: next,
        suspendedAt: next === "SUSPENDED" ? now : null,
        suspensionReason: next === "SUSPENDED" ? input.reason : null,
      },
      include: merchantStoreInclude,
    });
    const result = ownerManagementStoreDto(updated);
    await transaction.adminAuditLog.create({
      data: {
        action,
        adminUserId: context.userId,
        idempotencyKey: input.idempotencyKey,
        metadata: sanitizeAuditValue({
          after: auditStoreSnapshot(updated),
          before: auditStoreSnapshot(store),
          reason: input.reason,
        }) as Prisma.InputJsonValue,
        requestHash,
        result: result as Prisma.InputJsonValue,
        resultVersion: updated.updatedAt,
        targetId: updated.id,
        targetType: "Store",
      },
    });
    await notifyStoreLifecycle(transaction, {
      event: next === "REJECTED"
        ? "store.rejected"
        : next === "SUSPENDED"
          ? "store.suspended"
          : isApproval
            ? "store.approved"
            : "store.reactivated",
      organizationId: updated.organizationId,
      resultVersion: updated.updatedAt,
      storeId: updated.id,
    });
    return ownerManagementStoreDto(updated);
  });
}

async function lockAndLoadMerchantStore(
  transaction: Prisma.TransactionClient,
  actor: MerchantCommerceContext,
  storeId: string,
) {
  await lockStore(transaction, storeId);
  const store = await transaction.store.findFirst({
    where: { id: storeId, organizationId: actor.organizationId },
    include: merchantStoreInclude,
  });
  if (!store) commerceError("NOT_FOUND", "Store was not found.");
  return store;
}

async function loadReplayStore(
  _transaction: Prisma.TransactionClient,
  actor: MerchantCommerceContext,
  replay: { result: Prisma.JsonValue | null; targetId: string | null },
  targetId?: string,
) {
  mutationReplayTarget(replay, targetId);
  if (!replay.result || typeof replay.result !== "object" || Array.isArray(replay.result)) {
    commerceError("CONFLICT", "Store replay result is unavailable.");
  }
  void actor;
  return replay.result as ReturnType<typeof ownerManagementStoreDto>;
}

function loadAdminReplayStore(
  replay: { result: Prisma.JsonValue | null; targetId: string | null },
  storeId: string,
) {
  if (replay.targetId !== storeId || !replay.result || typeof replay.result !== "object" || Array.isArray(replay.result)) {
    commerceError("CONFLICT", "Store replay result is unavailable.");
  }
  return replay.result as ReturnType<typeof ownerManagementStoreDto>;
}

function requireOwner(actor: MerchantCommerceContext) {
  if (actor.systemRole !== "OWNER") {
    commerceError("FORBIDDEN", "Store lifecycle ownership is Owner-only.");
  }
}

function assertProfileEditable(store: MerchantStoreRecord, input: StoreProfileInput) {
  if (store.status === "PENDING_REVIEW" || store.status === "SUSPENDED" || store.status === "ARCHIVED") {
    commerceError("INVALID_TRANSITION", `Store profile cannot be edited while ${store.status}.`);
  }
  if (store.status === "ACTIVE") {
    const materialChanged =
      store.name !== input.name ||
      store.slug !== input.slug ||
      store.description !== input.description ||
      store.logoUrl !== input.logoUrl ||
      store.coverImageUrl !== input.coverImageUrl;
    if (materialChanged) {
      commerceError(
        "VALIDATION_ERROR",
        "ACTIVE Store identity changes require a later explicit re-review policy.",
      );
    }
  }
}

function storeProfileData(input: StoreProfileInput) {
  return {
    coverImageUrl: input.coverImageUrl,
    currency: input.currency,
    deliveryArea: input.deliveryArea,
    deliveryCity: input.deliveryCity,
    deliveryEnabled: input.deliveryEnabled,
    deliveryEstimateMinutes: input.deliveryEstimateMinutes,
    deliveryFee: input.deliveryFee,
    description: input.description,
    logoUrl: input.logoUrl,
    minimumOrderValue: input.minimumOrderValue,
    name: input.name,
    pickupAdditionalDetails: input.pickupAdditionalDetails,
    pickupArea: input.pickupArea,
    pickupCity: input.pickupCity,
    pickupEnabled: input.pickupEnabled,
    pickupInstructions: input.pickupInstructions,
    pickupStreet: input.pickupStreet,
    preparationEstimateMinutes: input.preparationEstimateMinutes,
    slug: input.slug,
    supportPhone: input.supportPhone,
  };
}

function activeOperationalProfileData(input: StoreProfileInput) {
  return {
    currency: input.currency,
    deliveryArea: input.deliveryArea,
    deliveryCity: input.deliveryCity,
    deliveryEnabled: input.deliveryEnabled,
    deliveryEstimateMinutes: input.deliveryEstimateMinutes,
    deliveryFee: input.deliveryFee,
    minimumOrderValue: input.minimumOrderValue,
    pickupAdditionalDetails: input.pickupAdditionalDetails,
    pickupArea: input.pickupArea,
    pickupCity: input.pickupCity,
    pickupEnabled: input.pickupEnabled,
    pickupInstructions: input.pickupInstructions,
    pickupStreet: input.pickupStreet,
    preparationEstimateMinutes: input.preparationEstimateMinutes,
    supportPhone: input.supportPhone,
  };
}

function auditStoreSnapshot(store: MerchantStoreRecord) {
  return {
    deliveryEnabled: store.deliveryEnabled,
    deliveryEstimateMinutes: store.deliveryEstimateMinutes,
    deliveryFee: store.deliveryFee.toFixed(3),
    minimumOrderValue: store.minimumOrderValue.toFixed(3),
    name: store.name,
    pickupEnabled: store.pickupEnabled,
    preparationEstimateMinutes: store.preparationEstimateMinutes,
    slug: store.slug,
    status: store.status,
    version: store.updatedAt.toISOString(),
  };
}

function parse<Output>(schema: { safeParse(value: unknown): { success: true; data: Output } | { success: false } }, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) commerceError("VALIDATION_ERROR", "Commerce input is invalid.");
  return result.data;
}

function mapStoreWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
    if (target.includes("slug")) commerceError("CONFLICT", "Store slug is already in use.");
    if (target.includes("organizationId")) commerceError("CONFLICT", "This Organization already owns a Store.");
    commerceError("CONFLICT", "Store uniqueness conflict.");
  }
  throw error;
}
