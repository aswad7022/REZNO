import { randomUUID } from "node:crypto";
import type { PaymentRefundReason, Prisma } from "@prisma/client";

import {
  assertCommerceAdminCurrent,
  assertMerchantCommerceContextCurrent,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import { businessPaymentIntentDto, paymentIntentDtoInclude } from "@/features/payments/domain/dto";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import { paymentDecimal, paymentMoneyString } from "@/features/payments/domain/money";
import { assertPaymentRefundTransition, paymentIntentStatusForTotals } from "@/features/payments/domain/state-machine";
import { postRefundJournal } from "@/features/payments/services/ledger";
import { notifyRefundResult } from "@/features/payments/services/payment-notifications";
import { syncTargetProjection } from "@/features/payments/services/payment-intents";
import { lockPaymentIntent, lockPaymentRefund, runPaymentSerializable } from "@/features/payments/services/transaction";
import { configuredPaymentProvider } from "@/features/payments/providers/registry";

export interface RefundRequestInput {
  amount: string;
  expectedVersion: number;
  idempotencyKey: string;
  note?: string | null;
  paymentIntentId: string;
  reasonCode: PaymentRefundReason;
}

type RefundActor = {
  actorId: string;
  actorKey: string;
  actorType: "ADMIN" | "MERCHANT";
  adminContext?: CommerceAdminContext;
  organizationId: string;
};

export async function requestBusinessRefund(reference: MerchantActorReference, input: RefundRequestInput) {
  const actor = await resolveMerchantCommerceContext(reference, "PAYMENT_REFUND");
  return requestRefund({
    actorId: actor.personId,
    actorKey: "merchant:" + actor.membershipId + ":" + actor.roleId,
    actorType: "MERCHANT",
    organizationId: actor.organizationId,
  }, input, async (transaction) => {
    await assertMerchantCommerceContextCurrent(transaction, actor, "PAYMENT_REFUND");
  });
}

export async function requestAdminRefund(
  context: CommerceAdminContext,
  input: RefundRequestInput,
) {
  const organizationId = await adminIntentOrganization(context, input.paymentIntentId, "PAYMENTS_REFUND");
  return requestRefund({
    actorId: context.userId,
    actorKey: "admin:" + context.userId,
    actorType: "ADMIN",
    adminContext: context,
    organizationId,
  }, input, async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_REFUND");
  });
}

export async function retryBusinessRefund(
  reference: MerchantActorReference,
  refundId: string,
  input: { expectedVersion: number; idempotencyKey: string },
) {
  const actor = await resolveMerchantCommerceContext(reference, "PAYMENT_REFUND");
  return retryRefund({
    actorId: actor.personId,
    actorKey: "merchant:" + actor.membershipId + ":" + actor.roleId,
    actorType: "MERCHANT",
    organizationId: actor.organizationId,
  }, refundId, input, async (transaction) => {
    await assertMerchantCommerceContextCurrent(transaction, actor, "PAYMENT_REFUND");
  });
}

export async function retryAdminRefund(
  context: CommerceAdminContext,
  refundId: string,
  input: { expectedVersion: number; idempotencyKey: string },
) {
  const organizationId = await adminRefundOrganization(context, refundId);
  return retryRefund({
    actorId: context.userId,
    actorKey: "admin:" + context.userId,
    actorType: "ADMIN",
    adminContext: context,
    organizationId,
  }, refundId, input, async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_REFUND");
  });
}

async function requestRefund(
  actor: RefundActor,
  input: RefundRequestInput,
  revalidate: (transaction: Prisma.TransactionClient) => Promise<void>,
) {
  const provider = configuredPaymentProvider();
  const claimOwner = "refund-request:" + randomUUID();
  const prepared = await runPaymentSerializable(async (transaction) => {
    await revalidate(transaction);
    await lockPaymentIntent(transaction, input.paymentIntentId);
    const intent = await transaction.paymentIntent.findFirst({
      where: { id: input.paymentIntentId, organizationId: actor.organizationId },
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    const amount = paymentDecimal(input.amount, "refund.amount");
    const requestHash = paymentRequestHash({
      actorKey: actor.actorKey,
      amount: paymentMoneyString(amount),
      currency: intent.currency,
      expectedVersion: input.expectedVersion,
      intentId: intent.id,
      note: boundedNote(input.note),
      reasonCode: input.reasonCode,
    });
    const replay = await transaction.paymentRefund.findUnique({
      where: {
        requestedByActorType_requestedByActorId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          requestedByActorId: actor.actorId,
          requestedByActorType: actor.actorType,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) paymentError("IDEMPOTENCY_CONFLICT", "Refund idempotency key was reused with changed input.");
      const now = new Date();
      if (replay.status !== "PROCESSING" || (replay.claimExpiresAt && replay.claimExpiresAt > now)) {
        return { claimOwner: null, refundId: replay.id, replayed: true };
      }
      await transaction.paymentRefund.update({
        where: { id: replay.id },
        data: { claimedBy: claimOwner, claimExpiresAt: new Date(now.getTime() + 60_000) },
      });
      return { claimOwner, refundId: replay.id, replayed: false };
    }
    if (intent.version !== input.expectedVersion) paymentError("STALE_VERSION", "Payment changed. Refresh and retry.");
    if (!["CAPTURED", "PARTIALLY_REFUNDED"].includes(intent.status) || !intent.providerReference) {
      paymentError("REFUND_NOT_ALLOWED", "Payment cannot be refunded.");
    }
    if (intent.commissionBasisPoints !== 0 || !intent.commissionAmount.isZero()) {
      paymentError("REFUND_NOT_ALLOWED", "This commission allocation requires an approved refund policy.");
    }
    const available = intent.capturedAmount.minus(intent.refundedAmount);
    if (amount.greaterThan(available)) paymentError("REFUND_AMOUNT_EXCEEDED", "Refund exceeds the refundable balance.");
    const refund = await transaction.paymentRefund.create({
      data: {
        amount,
        claimedBy: claimOwner,
        claimExpiresAt: new Date(Date.now() + 60_000),
        currency: intent.currency,
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        note: boundedNote(input.note),
        paymentIntentId: intent.id,
        reasonCode: input.reasonCode,
        requestHash,
        requestedByActorId: actor.actorId,
        requestedByActorType: actor.actorType,
      },
    });
    assertPaymentRefundTransition(refund.status, "PROCESSING");
    await transaction.paymentRefund.update({
      where: { id: refund.id },
      data: { status: "PROCESSING", version: { increment: 1 } },
    });
    if (actor.actorType === "ADMIN" && actor.adminContext) {
      await transaction.adminAuditLog.create({
        data: {
          action: "payments.refund.request",
          adminUserId: actor.adminContext.userId,
          idempotencyKey: input.idempotencyKey,
          metadata: { amount: paymentMoneyString(amount), currency: intent.currency, reasonCode: input.reasonCode },
          requestHash,
          targetId: refund.id,
          targetType: "PaymentRefund",
        },
      });
    } else {
      const membership = await transaction.organizationMember.findFirstOrThrow({
        where: { organizationId: actor.organizationId, personId: actor.actorId, status: "ACTIVE", deletedAt: null },
        select: { id: true },
      });
      await transaction.businessAuditLog.create({
        data: {
          action: "payments.refund.request",
          actorMembershipId: membership.id,
          actorPersonId: actor.actorId,
          after: { amount: paymentMoneyString(amount), currency: intent.currency, reasonCode: input.reasonCode, status: "PROCESSING" },
          id: randomUUID(),
          organizationId: actor.organizationId,
          targetId: refund.id,
          targetType: "PaymentRefund",
        },
      });
    }
    return { claimOwner, refundId: refund.id, replayed: false };
  });
  if (prepared.replayed) {
    return loadRefundIntent(prepared.refundId);
  }
  const refund = await loadRefundForProvider(prepared.refundId);
  let result: Awaited<ReturnType<ReturnType<typeof configuredPaymentProvider>["refundPayment"]>>;
  try {
    result = await provider.refundPayment({
      amount: paymentMoneyString(refund.amount),
      currency: "IQD",
      paymentIntentId: refund.paymentIntentId,
      providerReference: refund.paymentIntent.providerReference!,
      providerRequestReference: "refund_" + refund.id + "_v" + refund.version,
      refundId: refund.id,
    });
  } catch {
    result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
  }
  return applyRefundResult(refund.id, prepared.claimOwner!, result);
}

async function retryRefund(
  actor: RefundActor,
  refundId: string,
  input: { expectedVersion: number; idempotencyKey: string },
  revalidate: (transaction: Prisma.TransactionClient) => Promise<void>,
) {
  const provider = configuredPaymentProvider();
  const claimOwner = "refund-retry:" + randomUUID();
  const prepared = await runPaymentSerializable(async (transaction) => {
    await revalidate(transaction);
    await lockPaymentRefund(transaction, refundId);
    const refund = await transaction.paymentRefund.findFirst({
      where: { id: refundId, paymentIntent: { organizationId: actor.organizationId } },
      include: { paymentIntent: true },
    });
    if (!refund) paymentError("NOT_FOUND", "Refund was not found.");
    const requestHash = paymentRequestHash({
      action: "RETRY_REFUND",
      actorKey: actor.actorKey,
      expectedVersion: input.expectedVersion,
      refundId,
    });
    const replay = await transaction.paymentMutation.findUnique({
      where: { actorKey_idempotencyKey: { actorKey: actor.actorKey, idempotencyKey: input.idempotencyKey } },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) paymentError("IDEMPOTENCY_CONFLICT", "Refund retry key was reused with changed input.");
      if (replay.status !== "PROCESSING") return { claimOwner: null, mutationStatus: replay.status, refund };
      const now = new Date();
      if (refund.status !== "PROCESSING" || (refund.claimExpiresAt && refund.claimExpiresAt > now)) {
        return { claimOwner: null, mutationStatus: replay.status, refund };
      }
      const reclaimed = await transaction.paymentRefund.update({
        where: { id: refund.id },
        data: { claimedBy: claimOwner, claimExpiresAt: new Date(now.getTime() + 60_000) },
        include: { paymentIntent: true },
      });
      return { claimOwner, mutationStatus: replay.status, refund: reclaimed };
    }
    if (refund.version !== input.expectedVersion) paymentError("STALE_VERSION", "Refund changed. Refresh and retry.");
    if (refund.status !== "FAILED") paymentError("REFUND_NOT_ALLOWED", "Only a failed refund can be retried.");
    if (!refund.paymentIntent.providerReference) paymentError("REFUND_NOT_ALLOWED", "Refund provider reference is unavailable.");
    await transaction.paymentMutation.create({
      data: {
        action: "RETRY_REFUND",
        actorKey: actor.actorKey,
        actorPersonId: actor.actorType === "MERCHANT" ? actor.actorId : null,
        actorType: actor.actorType,
        expectedVersion: input.expectedVersion,
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        organizationId: actor.organizationId,
        paymentIntentId: refund.paymentIntentId,
        requestHash,
        targetId: refund.paymentIntent.orderId ?? refund.paymentIntent.bookingId!,
        targetType: refund.paymentIntent.orderId ? "ORDER" : "BOOKING",
      },
    });
    assertPaymentRefundTransition(refund.status, "PROCESSING");
    const updated = await transaction.paymentRefund.update({
      where: { id: refund.id },
      data: {
        claimedBy: claimOwner,
        claimExpiresAt: new Date(Date.now() + 60_000),
        safeProviderCode: null,
        status: "PROCESSING",
        version: { increment: 1 },
      },
      include: { paymentIntent: true },
    });
    if (actor.actorType === "ADMIN" && actor.adminContext) {
      await transaction.adminAuditLog.create({
        data: {
          action: "payments.refund.retry",
          adminUserId: actor.adminContext.userId,
          idempotencyKey: input.idempotencyKey,
          metadata: { refundId },
          requestHash,
          targetId: refund.id,
          targetType: "PaymentRefund",
        },
      });
    }
    return { claimOwner, mutationStatus: "PROCESSING" as const, refund: updated };
  });
  if (prepared.mutationStatus === "COMPLETED") return loadRefundIntent(refundId);
  if (prepared.mutationStatus === "FAILED") paymentError("PAYMENT_PROVIDER_FAILURE", "Refund retry failed safely.");
  if (!prepared.claimOwner) return loadRefundIntent(refundId);
  let result: Awaited<ReturnType<ReturnType<typeof configuredPaymentProvider>["refundPayment"]>>;
  try {
    result = await provider.refundPayment({
      amount: paymentMoneyString(prepared.refund.amount),
      currency: "IQD",
      paymentIntentId: prepared.refund.paymentIntentId,
      providerReference: prepared.refund.paymentIntent.providerReference!,
      providerRequestReference: "refund_retry_" + input.idempotencyKey,
      refundId,
    });
  } catch {
    result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
  }
  const payment = await applyRefundResult(refundId, prepared.claimOwner, result);
  await runPaymentSerializable(async (transaction) => {
    await revalidate(transaction);
    const current = await transaction.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    if (current.status === "PROCESSING") return;
    await transaction.paymentMutation.update({
      where: { actorKey_idempotencyKey: { actorKey: actor.actorKey, idempotencyKey: input.idempotencyKey } },
      data: current.status === "SUCCEEDED"
        ? { result: { intentId: current.paymentIntentId, refundId }, resultVersion: current.version, status: "COMPLETED" }
        : { failureCode: current.safeProviderCode ?? "PAYMENT_PROVIDER_FAILURE", status: "FAILED" },
    });
  });
  return payment;
}

async function applyRefundResult(
  refundId: string,
  claimOwner: string,
  result: Awaited<ReturnType<ReturnType<typeof configuredPaymentProvider>["refundPayment"]>>,
) {
  return runPaymentSerializable(async (transaction) => {
    await lockPaymentRefund(transaction, refundId);
    const refund = await transaction.paymentRefund.findUnique({
      where: { id: refundId },
      include: { paymentIntent: true },
    });
    if (!refund) paymentError("NOT_FOUND", "Refund was not found.");
    await lockPaymentIntent(transaction, refund.paymentIntentId);
    if (refund.status === "SUCCEEDED") return loadIntentById(transaction, refund.paymentIntentId);
    if (refund.status !== "PROCESSING" || refund.claimedBy !== claimOwner) {
      return loadIntentById(transaction, refund.paymentIntentId);
    }
    const now = new Date();
    if (result.outcome === "READY" || (result.outcome === "DUPLICATE" && result.providerReference)) {
      assertPaymentRefundTransition(refund.status, "SUCCEEDED");
      const newRefunded = refund.paymentIntent.refundedAmount.plus(refund.amount);
      if (newRefunded.greaterThan(refund.paymentIntent.capturedAmount)) {
        paymentError("REFUND_AMOUNT_EXCEEDED", "Refund exceeds the captured amount.");
      }
      const newStatus = paymentIntentStatusForTotals({
        amount: refund.paymentIntent.amount,
        capturedAmount: refund.paymentIntent.capturedAmount,
        refundedAmount: newRefunded,
      });
      const intent = await transaction.paymentIntent.update({
        where: { id: refund.paymentIntentId },
        data: { refundedAmount: newRefunded, status: newStatus, version: { increment: 1 } },
      });
      await transaction.paymentRefund.update({
        where: { id: refund.id },
        data: {
          completedAt: now,
          claimedBy: null,
          claimExpiresAt: null,
          providerReference: result.providerReference,
          safeProviderCode: result.safeCode,
          status: "SUCCEEDED",
          version: { increment: 1 },
        },
      });
      await postRefundJournal(transaction, {
        amount: refund.amount,
        currency: refund.currency,
        organizationId: intent.organizationId,
        paymentIntentId: intent.id,
        paymentRefundId: refund.id,
        postedAt: now,
      });
      await notifyRefundResult(transaction, {
        amount: refund.amount,
        currency: refund.currency,
        paymentIntentId: intent.id,
        refundId: refund.id,
        succeeded: true,
      });
      await syncTargetProjection(transaction, intent, now);
      return loadIntentById(transaction, intent.id);
    }
    assertPaymentRefundTransition(refund.status, "FAILED");
    await transaction.paymentRefund.update({
      where: { id: refund.id },
      data: {
        claimedBy: null,
        claimExpiresAt: null,
        safeProviderCode: result.safeCode ?? "REFUND_PROVIDER_FAILURE",
        status: "FAILED",
        version: { increment: 1 },
      },
    });
    await notifyRefundResult(transaction, {
      amount: refund.amount,
      currency: refund.currency,
      paymentIntentId: refund.paymentIntentId,
      refundId: refund.id,
      succeeded: false,
    });
    return loadIntentById(transaction, refund.paymentIntentId);
  });
}

async function loadRefundForProvider(refundId: string) {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.paymentRefund.findUniqueOrThrow({
    where: { id: refundId },
    include: { paymentIntent: true },
  });
}

async function loadRefundIntent(refundId: string) {
  const refund = await loadRefundForProvider(refundId);
  const { prisma } = await import("@/lib/db/prisma");
  return loadIntentById(prisma, refund.paymentIntentId);
}

async function loadIntentById(database: Prisma.TransactionClient | (typeof import("@/lib/db/prisma"))["prisma"], intentId: string) {
  const intent = await database.paymentIntent.findUniqueOrThrow({
    where: { id: intentId },
    include: paymentIntentDtoInclude,
  });
  return businessPaymentIntentDto(intent);
}

function boundedNote(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (normalized.length > 500) paymentError("VALIDATION_ERROR", "Refund note is too long.");
  return normalized || null;
}

function adminIntentOrganization(
  context: CommerceAdminContext,
  paymentIntentId: string,
  permission: "PAYMENTS_REFUND",
) {
  return runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, permission);
    const intent = await transaction.paymentIntent.findUnique({ where: { id: paymentIntentId }, select: { organizationId: true } });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    return intent.organizationId;
  });
}

function adminRefundOrganization(context: CommerceAdminContext, refundId: string) {
  return runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_REFUND");
    const refund = await transaction.paymentRefund.findUnique({
      where: { id: refundId },
      select: { paymentIntent: { select: { organizationId: true } } },
    });
    if (!refund) paymentError("NOT_FOUND", "Refund was not found.");
    return refund.paymentIntent.organizationId;
  });
}
