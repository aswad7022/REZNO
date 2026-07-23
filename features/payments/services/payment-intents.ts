import { randomUUID } from "node:crypto";
import { Prisma, type PaymentIntentStatus } from "@prisma/client";

import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { paymentCommissionPolicy } from "@/features/payments/domain/commission";
import { paymentIntentDto, paymentIntentDtoInclude } from "@/features/payments/domain/dto";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import { parsePaymentCurrency, paymentDecimal, paymentMoneyString } from "@/features/payments/domain/money";
import { assertPaymentIntentTransition, paymentIntentStatusForTotals, targetPaymentStatus } from "@/features/payments/domain/state-machine";
import { postCaptureJournal } from "@/features/payments/services/ledger";
import { notifyPaymentCaptured, notifyPaymentFailed } from "@/features/payments/services/payment-notifications";
import { lockPaymentIntent, runPaymentSerializable } from "@/features/payments/services/transaction";
import { configuredPaymentProvider } from "@/features/payments/providers/registry";
import type { ProviderResult } from "@/features/payments/providers/provider";
import type { PaymentExecutionGuard } from "@/features/payments/services/provider-events";
import { prisma } from "@/lib/db/prisma";
import {
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";

const MAX_ATTEMPTS_PER_INTENT = 5;

export type PayableTargetInput =
  | { targetType: "ORDER"; targetId: string }
  | { targetType: "BOOKING"; targetId: string };

export async function createCustomerPaymentIntent(
  customerPersonId: string,
  input: PayableTargetInput & { idempotencyKey: string },
) {
  const provider = configuredPaymentProvider();
  const created = await runPaymentSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerPersonId, transaction);
    const actorKey = "customer:" + customerPersonId;
    const replay = await transaction.paymentMutation.findUnique({
      where: { actorKey_idempotencyKey: { actorKey, idempotencyKey: input.idempotencyKey } },
      include: { paymentIntent: true },
    });
    if (replay) {
      const replayIntent = replay.paymentIntent;
      if (
        replay.action !== "CREATE_INTENT" ||
        replay.targetId !== input.targetId ||
        replay.targetType !== input.targetType ||
        !replayIntent ||
        replayIntent.customerPersonId !== customerPersonId
      ) {
        paymentError("IDEMPOTENCY_CONFLICT", "Payment idempotency key was reused with changed input.");
      }
      const replayHash = paymentRequestHash({
        actorKey,
        amount: paymentMoneyString(replayIntent.amount),
        currency: replayIntent.currency,
        organizationId: replayIntent.organizationId,
        targetId: input.targetId,
        targetType: input.targetType,
      });
      if (replay.requestHash !== replayHash) {
        paymentError("IDEMPOTENCY_CONFLICT", "Payment idempotency key was reused with changed input.");
      }
      return { intentId: replayIntent.id, replayed: true };
    }
    const target = await resolveTarget(transaction, customerPersonId, input);
    const requestHash = paymentRequestHash({
      actorKey,
      amount: paymentMoneyString(target.amount),
      currency: target.currency,
      organizationId: target.organizationId,
      targetId: input.targetId,
      targetType: input.targetType,
    });
    const existing = await transaction.paymentIntent.findFirst({
      where: {
        ...(input.targetType === "ORDER" ? { orderId: input.targetId } : { bookingId: input.targetId }),
      },
      orderBy: { generation: "desc" },
    });
    if (existing && ["CREATED", "REQUIRES_ACTION", "PROCESSING", "AUTHORIZED", "PARTIALLY_CAPTURED", "CAPTURED", "PARTIALLY_REFUNDED"].includes(existing.status)) {
      paymentError("PAYMENT_STATE_CONFLICT", "The target already has an active payment intent.");
    }
    const intentId = randomUUID();
    const intent = await transaction.paymentIntent.create({
      data: {
        amount: target.amount,
        bookingId: input.targetType === "BOOKING" ? input.targetId : null,
        commissionAmount: "0",
        commissionBasisPoints: 0,
        commissionPolicyId: paymentCommissionPolicy.id,
        currency: target.currency,
        customerPersonId,
        expiresAt: target.expiresAt,
        generation: (existing?.generation ?? 0) + 1,
        id: intentId,
        merchantNetAmount: "0",
        method: "ONLINE_PROVIDER",
        orderId: input.targetType === "ORDER" ? input.targetId : null,
        organizationId: target.organizationId,
        provider: provider.kind,
        storeId: target.storeId,
      },
    });
    if (input.targetType === "BOOKING") {
      await transaction.booking.update({
        where: { id: input.targetId },
        data: { paymentMethod: "ONLINE_PROVIDER", paymentStatus: "UNPAID" },
      });
    } else {
      await transaction.payment.update({
        where: { orderId: input.targetId },
        data: { method: "ONLINE_PROVIDER", paymentIntentId: intent.id },
      });
      await transaction.order.update({
        where: { id: input.targetId },
        data: { paymentMethod: "ONLINE_PROVIDER" },
      });
    }
    await transaction.paymentMutation.create({
      data: {
        action: "CREATE_INTENT",
        actorKey,
        actorPersonId: customerPersonId,
        actorType: "CUSTOMER",
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        organizationId: target.organizationId,
        paymentIntentId: intent.id,
        requestHash,
        result: { intentId: intent.id },
        resultVersion: intent.version,
        status: "COMPLETED",
        targetId: input.targetId,
        targetType: input.targetType,
      },
    });
    return { intentId: intent.id, replayed: false };
  });
  const submitted = await submitCustomerPaymentIntent(customerPersonId, created.intentId, input.idempotencyKey);
  return { ...submitted, replayed: created.replayed };
}

export async function getCustomerPaymentIntent(customerPersonId: string, paymentIntentId: string) {
  await requireActiveCommerceCustomer(customerPersonId);
  const intent = await prisma.paymentIntent.findFirst({
    where: { customerPersonId, id: paymentIntentId },
    include: paymentIntentDtoInclude,
  });
  if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
  return paymentIntentDto(intent);
}

export async function cancelCustomerPaymentIntent(
  customerPersonId: string,
  paymentIntentId: string,
  input: { expectedVersion: number; idempotencyKey: string },
) {
  const prepared = await runPaymentSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerPersonId, transaction);
    await lockPaymentIntent(transaction, paymentIntentId);
    const intent = await transaction.paymentIntent.findFirst({
      where: { customerPersonId, id: paymentIntentId },
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    const actorKey = "customer:" + customerPersonId;
    const requestHash = paymentRequestHash({
      action: "CANCEL_INTENT",
      actorKey,
      expectedVersion: input.expectedVersion,
      paymentIntentId,
    });
    const replay = await transaction.paymentMutation.findUnique({
      where: { actorKey_idempotencyKey: { actorKey, idempotencyKey: input.idempotencyKey } },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        paymentError("IDEMPOTENCY_CONFLICT", "Payment idempotency key was reused with changed input.");
      }
      return { mutationStatus: replay.status, providerReference: intent.providerReference, replayed: true };
    }
    if (intent.version !== input.expectedVersion) paymentError("STALE_VERSION", "Payment changed. Refresh and retry.");
    if (!["CREATED", "REQUIRES_ACTION", "AUTHORIZED"].includes(intent.status)) {
      paymentError(
        intent.capturedAmount.isPositive() ? "PAYMENT_ALREADY_CAPTURED" : "PAYMENT_STATE_CONFLICT",
        "Payment cannot be cancelled.",
      );
    }
    await transaction.paymentMutation.create({
      data: {
        action: "CANCEL_INTENT",
        actorKey,
        actorPersonId: customerPersonId,
        actorType: "CUSTOMER",
        expectedVersion: input.expectedVersion,
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        organizationId: intent.organizationId,
        paymentIntentId: intent.id,
        requestHash,
        targetId: intent.orderId ?? intent.bookingId!,
        targetType: intent.orderId ? "ORDER" : "BOOKING",
      },
    });
    return { mutationStatus: "PROCESSING" as const, providerReference: intent.providerReference, replayed: false };
  });
  if (prepared.replayed && prepared.mutationStatus === "COMPLETED") {
    return getCustomerPaymentIntent(customerPersonId, paymentIntentId);
  }
  if (prepared.replayed && prepared.mutationStatus === "FAILED") {
    paymentError("PAYMENT_PROVIDER_FAILURE", "Payment cancellation could not be confirmed.");
  }

  let providerResult: ProviderResult = { outcome: "READY" };
  if (prepared.providerReference) {
    try {
      providerResult = await configuredPaymentProvider().cancelPayment({
          paymentIntentId,
          providerReference: prepared.providerReference,
          providerRequestReference: "cancel_" + input.idempotencyKey,
        });
    } catch {
      providerResult = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
    }
  }

  const applied = await runPaymentSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerPersonId, transaction);
    await lockPaymentIntent(transaction, paymentIntentId);
    const intent = await transaction.paymentIntent.findFirst({
      where: { customerPersonId, id: paymentIntentId },
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    const mutation = await transaction.paymentMutation.findUniqueOrThrow({
      where: { actorKey_idempotencyKey: { actorKey: "customer:" + customerPersonId, idempotencyKey: input.idempotencyKey } },
    });
    if (intent.status === "CANCELLED") {
      return { failed: false as const, payment: await loadIntentDto(transaction, intent.id) };
    }
    if (providerResult.outcome === "READY" || providerResult.outcome === "NOT_FOUND" || providerResult.outcome === "DUPLICATE") {
      assertPaymentIntentTransition(intent.status, "CANCELLED");
      const now = new Date();
      const updated = await transaction.paymentIntent.update({
        where: { id: intent.id },
        data: { cancelledAt: now, status: "CANCELLED", version: { increment: 1 } },
      });
      await transaction.paymentAttempt.updateMany({
        where: { paymentIntentId: intent.id, status: { in: ["CREATED", "CLAIMED", "REQUIRES_ACTION", "AUTHORIZED"] } },
        data: { finishedAt: now, status: "CANCELLED" },
      });
      await syncTargetProjection(transaction, updated, now);
      await transaction.paymentMutation.update({
        where: { id: mutation.id },
        data: { result: { intentId: intent.id, status: "CANCELLED" }, resultVersion: updated.version, status: "COMPLETED" },
      });
      return { failed: false as const, payment: await loadIntentDto(transaction, intent.id) };
    }
    await transaction.paymentMutation.update({
      where: { id: mutation.id },
      data: { failureCode: providerResult.safeCode ?? "PAYMENT_PROVIDER_FAILURE", status: "FAILED" },
    });
    return { failed: true as const };
  });
  if (applied.failed) paymentError("PAYMENT_PROVIDER_FAILURE", "Payment cancellation could not be confirmed.");
  return applied.payment;
}

export async function submitCustomerPaymentIntent(
  customerPersonId: string,
  paymentIntentId: string,
  idempotencyKey: string,
) {
  const provider = configuredPaymentProvider();
  const claimOwner = "payment-submit:" + randomUUID();
  const claimed = await runPaymentSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerPersonId, transaction);
    await lockPaymentIntent(transaction, paymentIntentId);
    const intent = await transaction.paymentIntent.findFirst({
      where: { customerPersonId, id: paymentIntentId },
      include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 5 } },
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    const replay = intent.attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
    const now = new Date();
    if (replay) {
      if (replay.status !== "PROCESSING" || (replay.claimExpiresAt && replay.claimExpiresAt > now)) {
        return { attemptId: replay.id, claimOwner: null, replayed: true };
      }
      await transaction.paymentAttempt.update({
        where: { id: replay.id },
        data: {
          claimedBy: claimOwner,
          claimExpiresAt: new Date(now.getTime() + 60_000),
          startedAt: replay.startedAt ?? now,
        },
      });
      return { attemptId: replay.id, claimOwner, replayed: false };
    }
    if (intent.attempts.length >= MAX_ATTEMPTS_PER_INTENT) {
      paymentError("RATE_LIMITED", "Payment attempt limit was reached.");
    }
    if (!["CREATED", "REQUIRES_ACTION", "PROCESSING", "AUTHORIZED"].includes(intent.status)) {
      paymentError(intent.status === "CAPTURED" ? "PAYMENT_ALREADY_CAPTURED" : "PAYMENT_STATE_CONFLICT", "Payment cannot be submitted.");
    }
    const attemptId = randomUUID();
    await transaction.paymentAttempt.create({
      data: {
        attemptNumber: (intent.attempts[0]?.attemptNumber ?? 0) + 1,
        claimedBy: claimOwner,
        claimExpiresAt: new Date(now.getTime() + 60_000),
        id: attemptId,
        idempotencyKey,
        paymentIntentId: intent.id,
        provider: intent.provider,
        providerRequestReference: "attempt_" + attemptId,
        status: "CLAIMED",
      },
    });
    await transaction.paymentAttempt.update({
      where: { id: attemptId },
      data: { startedAt: now, status: "PROCESSING", version: { increment: 1 } },
    });
    if (intent.status !== "PROCESSING") {
      assertPaymentIntentTransition(intent.status, "PROCESSING");
      await transaction.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "PROCESSING", version: { increment: 1 } },
      });
    }
    return { attemptId, claimOwner, replayed: false };
  });
  if (claimed.replayed) {
    const intent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: paymentIntentId },
      include: paymentIntentDtoInclude,
    });
    return paymentIntentDto(intent);
  }
  const attempt = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: claimed.attemptId },
    include: { paymentIntent: true },
  });
  let result: ProviderResult;
  try {
    result = await provider.createPayment({
      amount: paymentMoneyString(attempt.paymentIntent.amount),
      currency: parsePaymentCurrency(attempt.paymentIntent.currency),
      expiresAt: attempt.paymentIntent.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
      paymentIntentId,
      providerRequestReference: attempt.providerRequestReference,
    });
  } catch {
    result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
  }
  if (result.outcome === "DUPLICATE" && result.providerReference) {
    try {
      result = await provider.inspectPayment({ paymentIntentId, providerReference: result.providerReference });
    } catch {
      result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
    }
  }
  const applied = await applyProviderCreateResult(paymentIntentId, attempt.id, claimed.claimOwner!, result);
  if (result.outcome === "NOT_CONFIGURED") {
    paymentError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Online payment provider is not configured.");
  }
  return applied;
}

async function applyProviderCreateResult(
  paymentIntentId: string,
  attemptId: string,
  claimOwner: string,
  result: ProviderResult,
  executionGuard?: PaymentExecutionGuard,
) {
  return runPaymentSerializable(async (transaction) => {
    await executionGuard?.(transaction);
    await lockPaymentIntent(transaction, paymentIntentId);
    const intent = await transaction.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { booking: { select: { status: true } }, order: { select: { status: true } } },
    });
    const attempt = await transaction.paymentAttempt.findUnique({ where: { id: attemptId } });
    if (!intent || !attempt) paymentError("NOT_FOUND", "Payment attempt was not found.");
    if (attempt.status !== "PROCESSING" || attempt.claimedBy !== claimOwner) {
      return loadIntentDto(transaction, intent.id);
    }
    if (intent.status === "CAPTURED") {
      return loadIntentDto(transaction, intent.id);
    }
    const now = new Date();
    if (result.outcome === "CAPTURED") {
      return applyCapture(transaction, {
        amount: intent.amount,
        attemptId,
        paymentIntentId,
        providerReference: result.providerReference ?? null,
        sourceId: attemptId,
        now,
      });
    }
    if (result.outcome === "REQUIRES_ACTION") {
      assertPaymentIntentTransition(intent.status, "REQUIRES_ACTION");
      await transaction.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          actionExpiresAt: result.actionExpiresAt,
          actionReference: result.actionReference,
          claimedBy: null,
          claimExpiresAt: null,
          finishedAt: now,
          providerPaymentReference: result.providerReference,
          requiresAction: true,
          safeProviderCode: result.safeCode,
          status: "REQUIRES_ACTION",
          version: { increment: 1 },
        },
      });
      await transaction.paymentIntent.update({
        where: { id: intent.id },
        data: { providerReference: result.providerReference, status: "REQUIRES_ACTION", version: { increment: 1 } },
      });
      return loadIntentDto(transaction, intent.id);
    }
    if (result.outcome === "AUTHORIZED") {
      assertPaymentIntentTransition(intent.status, "AUTHORIZED");
      await transaction.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          claimedBy: null,
          claimExpiresAt: null,
          finishedAt: now,
          providerPaymentReference: result.providerReference,
          safeProviderCode: result.safeCode,
          status: "AUTHORIZED",
          version: { increment: 1 },
        },
      });
      await transaction.paymentIntent.update({
        where: { id: intent.id },
        data: { authorizedAt: now, providerReference: result.providerReference, status: "AUTHORIZED", version: { increment: 1 } },
      });
      return loadIntentDto(transaction, intent.id);
    }
    const permanent = result.outcome === "PERMANENT_FAILURE" || result.outcome === "NOT_FOUND";
    const retryable = !permanent && result.outcome !== "NOT_CONFIGURED" && attempt.retryCount < 5;
    const nextRetryAt = retryable
      ? new Date(now.getTime() + paymentRetryDelayMilliseconds(attempt.retryCount))
      : null;
    await transaction.paymentAttempt.update({
      where: { id: attemptId },
      data: {
        claimedBy: null,
        claimExpiresAt: null,
        finishedAt: now,
        nextRetryAt,
        retryable,
        safeProviderCode: result.safeCode ?? "PROVIDER_FAILURE",
        status: "FAILED",
        version: { increment: 1 },
      },
    });
    await transaction.paymentIntent.update({
      where: { id: intent.id },
      data: permanent
        ? { failedAt: now, status: "FAILED", version: { increment: 1 } }
        : { status: "CREATED", version: { increment: 1 } },
    });
    if (permanent) {
      await notifyPaymentFailed(transaction, { eventId: attempt.id, paymentIntentId: intent.id });
    }
    return loadIntentDto(transaction, intent.id);
  });
}

export async function retryPaymentAttemptFromAutomation(
  context: CommerceAdminContext,
  input: {
    attemptId: string;
    executionGuard: PaymentExecutionGuard;
    expectedVersion: number;
    jobId: string;
  },
) {
  const claimOwner = "platform-job:" + input.jobId;
  const prepared = await runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_RECONCILE");
    await input.executionGuard(transaction);
    await transaction.$queryRaw(Prisma.sql`
      SELECT attempt."id"
      FROM "PaymentAttempt" AS attempt
      WHERE attempt."id" = ${input.attemptId}::uuid
      FOR UPDATE OF attempt
    `);
    const attempt = await transaction.paymentAttempt.findUnique({
      where: { id: input.attemptId },
      include: { paymentIntent: true },
    });
    if (!attempt) return null;
    await lockPaymentIntent(transaction, attempt.paymentIntentId);
    if (
      attempt.version !== input.expectedVersion
      || attempt.status !== "FAILED"
      || !attempt.retryable
      || !attempt.nextRetryAt
      || attempt.nextRetryAt > new Date()
      || attempt.retryCount >= 5
      || attempt.paymentIntent.capturedAmount.greaterThan(0)
      || !["CREATED", "PROCESSING", "AUTHORIZED"].includes(attempt.paymentIntent.status)
    ) {
      return {
        eligible: false as const,
        state: attempt.status,
      };
    }
    const now = new Date();
    const claimed = await transaction.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        claimedBy: claimOwner,
        claimExpiresAt: new Date(now.getTime() + 60_000),
        nextRetryAt: null,
        retryable: null,
        retryCount: { increment: 1 },
        startedAt: now,
        status: "PROCESSING",
        version: { increment: 1 },
      },
      include: { paymentIntent: true },
    });
    if (claimed.paymentIntent.status !== "PROCESSING") {
      await transaction.paymentIntent.update({
        where: { id: claimed.paymentIntentId },
        data: { status: "PROCESSING", version: { increment: 1 } },
      });
    }
    return { attempt: claimed, eligible: true as const };
  });
  if (!prepared) return { outcome: "ABSENT" as const, state: "ABSENT" as const };
  if (!prepared.eligible) return { outcome: "INELIGIBLE" as const, state: prepared.state };

  await runPaymentSerializable((transaction) => input.executionGuard(transaction));
  const provider = configuredPaymentProvider();
  let result: ProviderResult;
  try {
    result = await provider.createPayment({
      amount: paymentMoneyString(prepared.attempt.paymentIntent.amount),
      currency: parsePaymentCurrency(prepared.attempt.paymentIntent.currency),
      expiresAt: prepared.attempt.paymentIntent.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
      paymentIntentId: prepared.attempt.paymentIntentId,
      providerRequestReference: prepared.attempt.providerRequestReference,
    });
  } catch {
    result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
  }
  if (result.outcome === "DUPLICATE" && result.providerReference) {
    try {
      result = await provider.inspectPayment({
        paymentIntentId: prepared.attempt.paymentIntentId,
        providerReference: result.providerReference,
      });
    } catch {
      result = { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" };
    }
  }
  await applyProviderCreateResult(
    prepared.attempt.paymentIntentId,
    prepared.attempt.id,
    claimOwner,
    result,
    input.executionGuard,
  );
  const current = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: prepared.attempt.id },
    select: { status: true },
  });
  return { outcome: "COMPLETED" as const, state: current.status };
}

export async function applyCapture(
  transaction: Prisma.TransactionClient,
  input: {
    amount: Prisma.Decimal.Value;
    attemptId?: string;
    paymentIntentId: string;
    providerReference: string | null;
    sourceId: string;
    now: Date;
  },
) {
  await lockPaymentIntent(transaction, input.paymentIntentId);
  const intent = await transaction.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
    include: { booking: { select: { status: true } }, order: { select: { status: true } } },
  });
  if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
  const existingJournal = await transaction.financialJournal.findUnique({
    where: { sourceType_sourceId: { sourceId: input.sourceId, sourceType: "CAPTURE" } },
  });
  if (existingJournal) return loadIntentDto(transaction, intent.id);
  const captureAmount = paymentDecimal(input.amount, "captureAmount");
  if (!intent.capturedAmount.isZero() || !captureAmount.equals(intent.amount)) {
    paymentError("PAYMENT_AMOUNT_MISMATCH", "Capture must exactly match the authoritative payment amount.");
  }
  const newCaptured = intent.capturedAmount.plus(captureAmount);
  const snapshot = paymentCommissionPolicy.calculate(newCaptured);
  const newCommission = paymentDecimal(snapshot.amount, "commissionAmount", { allowZero: true });
  const commissionDelta = newCommission.minus(intent.commissionAmount);
  const merchantDelta = captureAmount.minus(commissionDelta);
  const calculatedStatus = paymentIntentStatusForTotals({
    amount: intent.amount,
    capturedAmount: newCaptured,
    refundedAmount: intent.refundedAmount,
  });
  const terminalLateCapture = ["CANCELLED", "EXPIRED"].includes(intent.status);
  const newStatus = terminalLateCapture ? intent.status : calculatedStatus;
  if (!terminalLateCapture) assertPaymentIntentTransition(intent.status, newStatus);
  const updated = await transaction.paymentIntent.update({
    where: { id: intent.id },
    data: {
      capturedAmount: newCaptured,
      capturedAt: input.now,
      commissionAmount: newCommission,
      commissionBasisPoints: snapshot.basisPoints,
      commissionPolicyId: snapshot.policyId,
      merchantNetAmount: snapshot.merchantNet,
      providerReference: input.providerReference ?? intent.providerReference,
      status: newStatus,
      version: { increment: 1 },
    },
  });
  const journal = await postCaptureJournal(transaction, {
    captureAmount,
    commissionAmount: commissionDelta,
    currency: intent.currency,
    merchantAmount: merchantDelta,
    organizationId: intent.organizationId,
    paymentIntentId: intent.id,
    postedAt: input.now,
    sourceId: input.sourceId,
  });
  await notifyPaymentCaptured(transaction, {
    amount: captureAmount,
    currency: intent.currency,
    eventId: journal.id,
    paymentIntentId: intent.id,
  });
  if (input.attemptId) {
    await transaction.paymentAttempt.update({
      where: { id: input.attemptId },
      data: {
        finishedAt: input.now,
        claimedBy: null,
        claimExpiresAt: null,
        providerPaymentReference: input.providerReference,
        requiresAction: false,
        status: "CAPTURED",
        retryable: null,
        nextRetryAt: null,
        version: { increment: 1 },
      },
    });
  }
  const lateTarget = terminalLateCapture || (intent.order
    ? ["CANCELLED", "EXPIRED", "REJECTED"].includes(intent.order.status)
    : intent.booking
      ? ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(intent.booking.status)
      : true);
  if (!lateTarget) await syncTargetProjection(transaction, updated, input.now);
  return loadIntentDto(transaction, intent.id);
}

function paymentRetryDelayMilliseconds(retryCount: number) {
  return [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000][
    Math.min(Math.max(retryCount, 0), 4)
  ]!;
}

export async function syncTargetProjection(
  transaction: Prisma.TransactionClient,
  intent: {
    amount: Prisma.Decimal;
    bookingId: string | null;
    capturedAmount: Prisma.Decimal;
    currency: string;
    id: string;
    orderId: string | null;
    refundedAmount: Prisma.Decimal;
    status: PaymentIntentStatus;
  },
  now: Date,
) {
  const status = targetPaymentStatus(intent);
  if (intent.orderId) {
    await transaction.order.update({ where: { id: intent.orderId }, data: { paymentMethod: "ONLINE_PROVIDER", paymentStatus: status } });
    await transaction.payment.update({
      where: { orderId: intent.orderId },
      data: {
        amount: intent.amount,
        currency: intent.currency,
        method: "ONLINE_PROVIDER",
        paidAt: status === "PAID" ? now : undefined,
        paymentIntentId: intent.id,
        status,
        voidedAt: status === "VOIDED" ? now : undefined,
      },
    });
  } else if (intent.bookingId) {
    await transaction.booking.update({
      where: { id: intent.bookingId },
      data: { paymentMethod: "ONLINE_PROVIDER", paymentStatus: status },
    });
  }
}

async function resolveTarget(
  transaction: Prisma.TransactionClient,
  customerPersonId: string,
  input: PayableTargetInput,
) {
  if (input.targetType === "ORDER") {
    const order = await transaction.order.findFirst({
      where: { customerId: customerPersonId, id: input.targetId },
      include: { store: { include: { organization: { include: { settings: true } } } }, payment: true },
    });
    if (!order) paymentError("NOT_FOUND", "Payable Order was not found.");
    if (!order.store.organization.settings?.allowOnlinePayments) paymentError("PAYMENT_NOT_PAYABLE", "Online payment is disabled for this Organization.");
    if (!["PENDING", "CONFIRMED"].includes(order.status) || order.paymentStatus !== "UNPAID") paymentError("PAYMENT_NOT_PAYABLE", "Order is not payable.");
    parsePaymentCurrency(order.currency);
    paymentDecimal(order.grandTotal, "order.grandTotal");
    return {
      amount: order.grandTotal,
      currency: "IQD" as const,
      expiresAt: order.reservationExpiresAt,
      organizationId: order.store.organizationId,
      storeId: order.storeId,
    };
  }
  const booking = await transaction.booking.findFirst({
    where: { customerId: customerPersonId, id: input.targetId },
    include: { organization: { include: { settings: true } } },
  });
  if (!booking) paymentError("NOT_FOUND", "Payable Booking was not found.");
  if (!booking.organization.settings?.allowOnlinePayments) paymentError("PAYMENT_NOT_PAYABLE", "Online payment is disabled for this Organization.");
  if (!["PENDING", "CONFIRMED"].includes(booking.status) || booking.paymentStatus !== "UNPAID") paymentError("PAYMENT_NOT_PAYABLE", "Booking is not payable.");
  parsePaymentCurrency(booking.currency);
  paymentDecimal(booking.priceSnapshot, "booking.priceSnapshot");
  return {
    amount: booking.priceSnapshot,
    currency: "IQD" as const,
    expiresAt: booking.startsAt,
    organizationId: booking.organizationId,
    storeId: null,
  };
}

async function loadIntentDto(transaction: Prisma.TransactionClient, id: string) {
  const loaded = await transaction.paymentIntent.findUniqueOrThrow({
    where: { id },
    include: paymentIntentDtoInclude,
  });
  return paymentIntentDto(loaded);
}
