import type { Prisma } from "@prisma/client";

import { paymentMoneyString, paymentSignedMoneyString } from "./money";

export const paymentIntentDtoInclude = {
  attempts: { orderBy: { attemptNumber: "desc" as const }, take: 5 },
  refunds: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 20 },
} satisfies Prisma.PaymentIntentInclude;

type Intent = Prisma.PaymentIntentGetPayload<{ include: typeof paymentIntentDtoInclude }>;

export function paymentIntentDto(intent: Intent) {
  const latestAttempt = intent.attempts[0] ?? null;
  return {
    kind: "PAYMENT_INTENT" as const,
    id: intent.id,
    target: intent.orderId ? { kind: "ORDER" as const, id: intent.orderId } : { kind: "BOOKING" as const, id: intent.bookingId! },
    status: intent.status,
    amount: paymentMoneyString(intent.amount),
    currency: intent.currency,
    capturedAmount: paymentMoneyString(intent.capturedAmount),
    refundedAmount: paymentMoneyString(intent.refundedAmount),
    refundableAmount: paymentMoneyString(intent.capturedAmount.minus(intent.refundedAmount)),
    version: intent.version,
    provider: { kind: intent.provider, displayName: intent.provider === "NOT_CONFIGURED" ? "Online payment" : "Payment provider" },
    action: latestAttempt?.requiresAction && latestAttempt.actionReference && latestAttempt.actionExpiresAt
      ? {
          kind: "PROVIDER_ACTION" as const,
          reference: latestAttempt.actionReference,
          expiresAt: latestAttempt.actionExpiresAt.toISOString(),
        }
      : null,
    attempts: intent.attempts.map((attempt) => ({
      kind: "PAYMENT_ATTEMPT" as const,
      id: attempt.id,
      number: attempt.attemptNumber,
      status: attempt.status,
      requiresAction: attempt.requiresAction,
      safeCode: attempt.safeProviderCode,
      createdAt: attempt.createdAt.toISOString(),
      finishedAt: attempt.finishedAt?.toISOString() ?? null,
    })),
    refunds: intent.refunds.map((refund) => ({
      kind: "PAYMENT_REFUND" as const,
      id: refund.id,
      amount: paymentMoneyString(refund.amount),
      currency: refund.currency,
      reason: refund.reasonCode,
      status: refund.status,
      version: refund.version,
      createdAt: refund.createdAt.toISOString(),
      completedAt: refund.completedAt?.toISOString() ?? null,
    })),
    expiresAt: intent.expiresAt?.toISOString() ?? null,
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

export function businessPaymentIntentDto(intent: Intent) {
  return {
    ...paymentIntentDto(intent),
    commission: {
      basisPoints: intent.commissionBasisPoints,
      amount: paymentMoneyString(intent.commissionAmount),
      merchantNet: paymentMoneyString(intent.merchantNetAmount),
      policyId: intent.commissionPolicyId,
    },
  };
}

export const settlementDtoInclude = {
  lines: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    take: 500,
  },
} satisfies Prisma.SettlementBatchInclude;

type Settlement = Prisma.SettlementBatchGetPayload<{ include: typeof settlementDtoInclude }>;

export function settlementBatchDto(batch: Settlement) {
  return {
    kind: "SETTLEMENT_BATCH" as const,
    id: batch.id,
    organizationId: batch.organizationId,
    currency: batch.currency,
    status: batch.status,
    meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT" as const,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    captureGross: paymentMoneyString(batch.captureGross),
    refunds: paymentMoneyString(batch.refunds),
    commission: paymentMoneyString(batch.commission),
    merchantNet: paymentSignedMoneyString(batch.merchantNet),
    version: batch.version,
    finalizedAt: batch.finalizedAt?.toISOString() ?? null,
    voidedAt: batch.voidedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    lines: batch.lines.map((line) => ({
      id: line.id,
      journalId: line.journalId,
      captureGross: paymentMoneyString(line.captureGross),
      refunds: paymentMoneyString(line.refunds),
      commission: paymentMoneyString(line.commission),
      merchantNet: paymentSignedMoneyString(line.merchantNet),
    })),
  };
}
