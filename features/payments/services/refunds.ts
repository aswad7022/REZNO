import { randomUUID } from "node:crypto";
import { Prisma, type PaymentRefundReason } from "@prisma/client";

import {
  assertCommerceAdminCurrent,
  assertMerchantCommerceContextCurrent,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import { businessPaymentIntentDto, paymentIntentDtoInclude } from "@/features/payments/domain/dto";
import {
  PaymentOperationRetryableError,
  paymentError,
} from "@/features/payments/domain/errors";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import { paymentDecimal, paymentMoneyString } from "@/features/payments/domain/money";
import { assertPaymentRefundTransition, paymentIntentStatusForTotals } from "@/features/payments/domain/state-machine";
import { postRefundJournal } from "@/features/payments/services/ledger";
import { notifyRefundResult } from "@/features/payments/services/payment-notifications";
import { syncTargetProjection } from "@/features/payments/services/payment-intents";
import { lockPaymentIntent, lockPaymentRefund, runPaymentSerializable } from "@/features/payments/services/transaction";
import { configuredPaymentProvider } from "@/features/payments/providers/registry";
import type { PaymentExecutionGuard } from "@/features/payments/services/provider-events";

export interface RefundRequestInput {
  amount: string;
  expectedVersion: number;
  idempotencyKey: string;
  note?: string | null;
  paymentIntentId: string;
  reasonCode: PaymentRefundReason;
}

const MAX_REFUND_RETRIES = 5;
const REFUND_OPERATION_CLAIM_MS = 60_000;

type RefundRetryTestPhase =
  | "AFTER_CLAIM_BEFORE_PROVIDER"
  | "AFTER_PROVIDER_BEFORE_APPLY";

type RefundRetryTestHook = (event: {
  claimOwner: string;
  phase: RefundRetryTestPhase;
  refundId: string;
}) => Promise<void> | void;

let refundRetryTestHook: RefundRetryTestHook | undefined;

export function setRefundRetryTestHook(hook: RefundRetryTestHook | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refund retry test hooks are unavailable in production.");
  }
  refundRetryTestHook = hook;
}

export function refundReservesCapacity(input: {
  nextRetryAt: Date | null;
  providerRequestReference: string | null;
  retryCount: number;
  retryable: boolean | null;
  status: "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
}) {
  return input.status === "REQUESTED"
    || input.status === "PROCESSING"
    || (
      input.status === "FAILED"
      && input.retryable === true
      && input.nextRetryAt !== null
      && input.retryCount < MAX_REFUND_RETRIES
      && input.providerRequestReference !== null
    );
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
  executionGuard?: PaymentExecutionGuard,
  automation?: {
    claimOwner: string;
    requireRetryable: true;
  },
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
  }, executionGuard, automation);
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
    const reserved = await reservedRefundAmount(transaction, intent.id);
    const available = intent.capturedAmount
      .minus(intent.refundedAmount)
      .minus(reserved);
    if (amount.greaterThan(available)) paymentError("REFUND_AMOUNT_EXCEEDED", "Refund exceeds the refundable balance.");
    const refundId = randomUUID();
    const refund = await transaction.paymentRefund.create({
      data: {
        amount,
        claimedBy: claimOwner,
        claimExpiresAt: new Date(Date.now() + 60_000),
        currency: intent.currency,
        id: refundId,
        idempotencyKey: input.idempotencyKey,
        note: boundedNote(input.note),
        paymentIntentId: intent.id,
        providerRequestReference: "refund_" + refundId,
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
      providerRequestReference: refund.providerRequestReference!,
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
  executionGuard?: PaymentExecutionGuard,
  automation?: {
    claimOwner: string;
    requireRetryable: true;
  },
) {
  const provider = configuredPaymentProvider();
  const claimOwner = automation?.claimOwner ?? "refund-retry:" + randomUUID();
  const prepared = await runPaymentSerializable(async (transaction) => {
    await revalidate(transaction);
    await executionGuard?.(transaction);
    const identity = await transaction.paymentRefund.findFirst({
      where: {
        id: refundId,
        paymentIntent: { organizationId: actor.organizationId },
      },
      select: { paymentIntentId: true },
    });
    if (!identity) paymentError("NOT_FOUND", "Refund was not found.");
    await lockPaymentIntent(transaction, identity.paymentIntentId);
    await lockPaymentRefund(transaction, refundId);
    const refund = await transaction.paymentRefund.findFirst({
      where: { id: refundId, paymentIntent: { organizationId: actor.organizationId } },
      include: { paymentIntent: true },
    });
    if (!refund) paymentError("NOT_FOUND", "Refund was not found.");
    const now = await refundDatabaseNow(transaction);
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
      if (replay.status !== "PROCESSING") {
        return {
          kind: replay.status === "COMPLETED"
            ? "TERMINAL" as const
            : "FAILED_MUTATION" as const,
          refund,
        };
      }
      if (refund.status === "SUCCEEDED") {
        await completeRefundMutation(
          transaction,
          actor.actorKey,
          input.idempotencyKey,
          refund,
        );
        return { kind: "TERMINAL" as const, refund };
      }
      if (refund.status === "FAILED" || refund.status === "CANCELLED") {
        await failRefundMutation(
          transaction,
          actor.actorKey,
          input.idempotencyKey,
          refund.safeProviderCode ?? (
            refund.status === "CANCELLED"
              ? "REFUND_CANCELLED"
              : "PAYMENT_PROVIDER_FAILURE"
          ),
        );
        return { kind: "FAILED_MUTATION" as const, refund };
      }
      if (
        refund.status !== "PROCESSING"
        || refund.version !== input.expectedVersion + 1
        || !refund.providerRequestReference
      ) {
        return { kind: "FAILED_MUTATION" as const, refund };
      }
      if (refund.claimExpiresAt && refund.claimExpiresAt > now) {
        return {
          kind: "RETRYABLE" as const,
          refund,
          retryAfterSeconds: boundedRefundClaimRetrySeconds(
            now,
            refund.claimExpiresAt,
          ),
        };
      }
      const available = await refundableCapacity(
        transaction,
        refund.paymentIntent,
        refund.id,
      );
      if (refund.amount.greaterThan(available)) {
        await terminateCapacityRejectedRefund(
          transaction,
          refund.id,
          actor.actorKey,
          input.idempotencyKey,
        );
        return { kind: "CAPACITY_REJECTED" as const, refund };
      }
      const reclaimed = await transaction.paymentRefund.update({
        where: { id: refund.id },
        data: {
          claimedBy: claimOwner,
          claimExpiresAt: new Date(now.getTime() + REFUND_OPERATION_CLAIM_MS),
        },
        include: { paymentIntent: true },
      });
      return { kind: "CLAIMED" as const, refund: reclaimed };
    }
    if (
      refund.status === "PROCESSING"
      && refund.claimExpiresAt
      && refund.claimExpiresAt > now
    ) {
      return {
        kind: "RETRYABLE" as const,
        refund,
        retryAfterSeconds: boundedRefundClaimRetrySeconds(
          now,
          refund.claimExpiresAt,
        ),
      };
    }
    if (refund.version !== input.expectedVersion) paymentError("STALE_VERSION", "Refund changed. Refresh and retry.");
    if (refund.status !== "FAILED") paymentError("REFUND_NOT_ALLOWED", "Only a failed refund can be retried.");
    if (
      automation?.requireRetryable
      && (
        !refund.retryable
        || !refund.nextRetryAt
        || refund.nextRetryAt > now
        || refund.retryCount >= MAX_REFUND_RETRIES
      )
    ) {
      paymentError("REFUND_NOT_ALLOWED", "Refund is not eligible for an automated retry.");
    }
    if (!refund.paymentIntent.providerReference) paymentError("REFUND_NOT_ALLOWED", "Refund provider reference is unavailable.");
    const providerRequestReference =
      refund.providerRequestReference ?? "refund_" + refund.id;
    const available = await refundableCapacity(
      transaction,
      refund.paymentIntent,
      refund.id,
    );
    if (refund.amount.greaterThan(available)) {
      await transaction.paymentMutation.create({
        data: {
          action: "RETRY_REFUND",
          actorKey: actor.actorKey,
          actorPersonId: actor.actorType === "MERCHANT" ? actor.actorId : null,
          actorType: actor.actorType,
          expectedVersion: input.expectedVersion,
          failureCode: "REFUND_CAPACITY_UNAVAILABLE",
          id: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          organizationId: actor.organizationId,
          paymentIntentId: refund.paymentIntentId,
          requestHash,
          status: "FAILED",
          targetId: refund.paymentIntent.orderId ?? refund.paymentIntent.bookingId!,
          targetType: refund.paymentIntent.orderId ? "ORDER" : "BOOKING",
        },
      });
      await transaction.paymentRefund.update({
        where: { id: refund.id },
        data: {
          claimedBy: null,
          claimExpiresAt: null,
          nextRetryAt: null,
          retryable: false,
          safeProviderCode: "REFUND_CAPACITY_UNAVAILABLE",
          version: { increment: 1 },
        },
      });
      return { kind: "CAPACITY_REJECTED" as const, refund };
    }
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
        claimExpiresAt: new Date(now.getTime() + REFUND_OPERATION_CLAIM_MS),
        nextRetryAt: null,
        providerRequestReference,
        retryable: null,
        retryCount: { increment: 1 },
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
    return { kind: "CLAIMED" as const, refund: updated };
  });
  if (prepared.kind === "TERMINAL") return loadRefundIntent(refundId);
  if (prepared.kind === "FAILED_MUTATION") {
    paymentError("PAYMENT_PROVIDER_FAILURE", "Refund retry failed safely.");
  }
  if (prepared.kind === "CAPACITY_REJECTED") {
    paymentError(
      "REFUND_AMOUNT_EXCEEDED",
      "Refund retry no longer fits inside the captured balance.",
    );
  }
  if (prepared.kind === "RETRYABLE") {
    throw new PaymentOperationRetryableError(
      prepared.retryAfterSeconds,
      prepared.refund.status,
    );
  }
  await refundRetryTestHook?.({
    claimOwner,
    phase: "AFTER_CLAIM_BEFORE_PROVIDER",
    refundId,
  });
  if (executionGuard) {
    try {
      await runPaymentSerializable((transaction) => executionGuard(transaction));
    } catch (error) {
      await recoverRefundAfterInterruption({
        actorKey: actor.actorKey,
        claimOwner,
        idempotencyKey: input.idempotencyKey,
        refundId,
        safeCode: "AUTHORITY_REVOKED",
      });
      throw error;
    }
  }
  let result: Awaited<ReturnType<ReturnType<typeof configuredPaymentProvider>["refundPayment"]>>;
  try {
    result = await provider.refundPayment({
      amount: paymentMoneyString(prepared.refund.amount),
      currency: "IQD",
      paymentIntentId: prepared.refund.paymentIntentId,
      providerReference: prepared.refund.paymentIntent.providerReference!,
      providerRequestReference: prepared.refund.providerRequestReference ?? "refund_" + prepared.refund.id,
      refundId,
    });
  } catch {
    result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
  }
  await refundRetryTestHook?.({
    claimOwner,
    phase: "AFTER_PROVIDER_BEFORE_APPLY",
    refundId,
  });
  try {
    return await applyRefundResult(
      refundId,
      claimOwner,
      result,
      executionGuard,
      {
        actorKey: actor.actorKey,
        idempotencyKey: input.idempotencyKey,
      },
    );
  } catch (error) {
    await recoverRefundAfterInterruption({
      actorKey: actor.actorKey,
      claimOwner,
      idempotencyKey: input.idempotencyKey,
      refundId,
      safeCode: "PROVIDER_RESULT_UNAPPLIED",
    });
    throw error;
  }
}

async function applyRefundResult(
  refundId: string,
  claimOwner: string,
  result: Awaited<ReturnType<ReturnType<typeof configuredPaymentProvider>["refundPayment"]>>,
  executionGuard?: PaymentExecutionGuard,
  mutation?: {
    actorKey: string;
    idempotencyKey: string;
  },
) {
  return runPaymentSerializable(async (transaction) => {
    await executionGuard?.(transaction);
    const identity = await transaction.paymentRefund.findUnique({
      where: { id: refundId },
      select: { paymentIntentId: true },
    });
    if (!identity) paymentError("NOT_FOUND", "Refund was not found.");
    await lockPaymentIntent(transaction, identity.paymentIntentId);
    await lockPaymentRefund(transaction, refundId);
    const refund = await transaction.paymentRefund.findUnique({
      where: { id: refundId },
      include: { paymentIntent: true },
    });
    if (!refund) paymentError("NOT_FOUND", "Refund was not found.");
    if (refund.status === "SUCCEEDED") {
      if (mutation) {
        await completeRefundMutation(
          transaction,
          mutation.actorKey,
          mutation.idempotencyKey,
          refund,
        );
      }
      return loadIntentById(transaction, refund.paymentIntentId);
    }
    if (refund.status !== "PROCESSING" || refund.claimedBy !== claimOwner) {
      if (mutation && refund.status === "FAILED") {
        await failRefundMutation(
          transaction,
          mutation.actorKey,
          mutation.idempotencyKey,
          refund.safeProviderCode ?? "PAYMENT_PROVIDER_FAILURE",
        );
      }
      return loadIntentById(transaction, refund.paymentIntentId);
    }
    const now = await refundDatabaseNow(transaction);
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
      const completedRefund = await transaction.paymentRefund.update({
        where: { id: refund.id },
        data: {
          completedAt: now,
          claimedBy: null,
          claimExpiresAt: null,
          providerReference: result.providerReference,
          nextRetryAt: null,
          retryable: null,
          safeProviderCode: result.safeCode,
          status: "SUCCEEDED",
          version: { increment: 1 },
        },
      });
      if (mutation) {
        await completeRefundMutation(
          transaction,
          mutation.actorKey,
          mutation.idempotencyKey,
          completedRefund,
        );
      }
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
    const retryable =
      result.outcome === "TRANSIENT_FAILURE"
      && refund.retryCount < MAX_REFUND_RETRIES;
    const nextRetryAt = retryable
      ? new Date(now.getTime() + refundRetryDelayMilliseconds(refund.retryCount))
      : null;
    const failedRefund = await transaction.paymentRefund.update({
      where: { id: refund.id },
      data: {
        claimedBy: null,
        claimExpiresAt: null,
        nextRetryAt,
        retryable,
        safeProviderCode: result.safeCode ?? "REFUND_PROVIDER_FAILURE",
        status: "FAILED",
        version: { increment: 1 },
      },
    });
    if (mutation) {
      await failRefundMutation(
        transaction,
        mutation.actorKey,
        mutation.idempotencyKey,
        failedRefund.safeProviderCode ?? "PAYMENT_PROVIDER_FAILURE",
      );
    }
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

async function reservedRefundAmount(
  transaction: Prisma.TransactionClient,
  paymentIntentId: string,
  excludeRefundId?: string,
) {
  const reservations = await transaction.paymentRefund.findMany({
    where: {
      paymentIntentId,
      ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
      OR: [
        { status: "REQUESTED" },
        { status: "PROCESSING" },
        {
          nextRetryAt: { not: null },
          providerRequestReference: { not: null },
          retryCount: { lt: MAX_REFUND_RETRIES },
          retryable: true,
          status: "FAILED",
        },
      ],
    },
    select: { amount: true },
  });
  return reservations.reduce(
    (total, reservation) => total.plus(reservation.amount),
    new Prisma.Decimal(0),
  );
}

async function refundableCapacity(
  transaction: Prisma.TransactionClient,
  intent: {
    capturedAmount: Prisma.Decimal;
    id: string;
    refundedAmount: Prisma.Decimal;
  },
  excludeRefundId?: string,
) {
  const reserved = await reservedRefundAmount(
    transaction,
    intent.id,
    excludeRefundId,
  );
  return intent.capturedAmount.minus(intent.refundedAmount).minus(reserved);
}

async function completeRefundMutation(
  transaction: Prisma.TransactionClient,
  actorKey: string,
  idempotencyKey: string,
  refund: {
    id: string;
    paymentIntentId: string;
    version: number;
  },
) {
  await transaction.paymentMutation.updateMany({
    where: {
      actorKey,
      idempotencyKey,
      status: "PROCESSING",
    },
    data: {
      failureCode: null,
      result: {
        intentId: refund.paymentIntentId,
        refundId: refund.id,
      },
      resultVersion: refund.version,
      status: "COMPLETED",
    },
  });
}

async function failRefundMutation(
  transaction: Prisma.TransactionClient,
  actorKey: string,
  idempotencyKey: string,
  failureCode: string,
) {
  await transaction.paymentMutation.updateMany({
    where: {
      actorKey,
      idempotencyKey,
      status: "PROCESSING",
    },
    data: {
      failureCode: failureCode.slice(0, 80),
      status: "FAILED",
    },
  });
}

async function terminateCapacityRejectedRefund(
  transaction: Prisma.TransactionClient,
  refundId: string,
  actorKey: string,
  idempotencyKey: string,
) {
  const refund = await transaction.paymentRefund.findUniqueOrThrow({
    where: { id: refundId },
  });
  if (refund.status === "PROCESSING") {
    assertPaymentRefundTransition(refund.status, "FAILED");
    await transaction.paymentRefund.update({
      where: { id: refund.id },
      data: {
        claimedBy: null,
        claimExpiresAt: null,
        nextRetryAt: null,
        retryable: false,
        safeProviderCode: "REFUND_CAPACITY_UNAVAILABLE",
        status: "FAILED",
        version: { increment: 1 },
      },
    });
  }
  await failRefundMutation(
    transaction,
    actorKey,
    idempotencyKey,
    "REFUND_CAPACITY_UNAVAILABLE",
  );
}

async function recoverRefundAfterInterruption(input: {
  actorKey: string;
  claimOwner: string;
  idempotencyKey: string;
  refundId: string;
  safeCode: string;
}) {
  return runPaymentSerializable(async (transaction) => {
    const identity = await transaction.paymentRefund.findUnique({
      where: { id: input.refundId },
      select: { paymentIntentId: true },
    });
    if (!identity) return;
    await lockPaymentIntent(transaction, identity.paymentIntentId);
    await lockPaymentRefund(transaction, input.refundId);
    const refund = await transaction.paymentRefund.findUnique({
      where: { id: input.refundId },
    });
    if (!refund) return;
    if (refund.status === "SUCCEEDED") {
      await completeRefundMutation(
        transaction,
        input.actorKey,
        input.idempotencyKey,
        refund,
      );
      return;
    }
    if (
      refund.status !== "PROCESSING"
      || refund.claimedBy !== input.claimOwner
    ) return;
    const now = await refundDatabaseNow(transaction);
    assertPaymentRefundTransition(refund.status, "FAILED");
    const retryable = refund.retryCount < MAX_REFUND_RETRIES;
    await transaction.paymentRefund.update({
      where: { id: refund.id },
      data: {
        claimedBy: null,
        claimExpiresAt: null,
        nextRetryAt: retryable
          ? new Date(now.getTime() + refundRetryDelayMilliseconds(refund.retryCount))
          : null,
        retryable,
        safeProviderCode: input.safeCode.slice(0, 80),
        status: "FAILED",
        version: { increment: 1 },
      },
    });
    await failRefundMutation(
      transaction,
      input.actorKey,
      input.idempotencyKey,
      input.safeCode,
    );
  });
}

async function refundDatabaseNow(transaction: Prisma.TransactionClient) {
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) paymentError("PAYMENT_STATE_CONFLICT", "Payment database time is unavailable.");
  return clock.now;
}

function boundedRefundClaimRetrySeconds(now: Date, expiresAt: Date) {
  return Math.max(
    1,
    Math.min(
      Math.ceil(REFUND_OPERATION_CLAIM_MS / 1_000),
      Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000),
    ),
  );
}

function refundRetryDelayMilliseconds(retryCount: number) {
  return [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000][
    Math.min(Math.max(retryCount, 0), 4)
  ]!;
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
