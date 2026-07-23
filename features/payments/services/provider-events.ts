import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { paymentError } from "@/features/payments/domain/errors";
import { parsePaymentCurrency, paymentDecimal } from "@/features/payments/domain/money";
import { assertPaymentIntentTransition } from "@/features/payments/domain/state-machine";
import { paymentProvider } from "@/features/payments/providers/registry";
import type { SafeWebhookInput } from "@/features/payments/providers/provider";
import { applyCapture } from "@/features/payments/services/payment-intents";
import { lockPaymentIntent, runPaymentSerializable } from "@/features/payments/services/transaction";
import { enqueueProviderEventPlatformJob } from "@/features/platform-jobs/services/jobs";

export type PaymentExecutionGuard = (
  transaction: Prisma.TransactionClient,
) => Promise<void>;

export async function processPaymentProviderWebhook(input: SafeWebhookInput) {
  const provider = paymentProvider();
  if (provider.kind === "NOT_CONFIGURED") {
    paymentError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Online payment provider is not configured.");
  }
  const parsed = await provider.verifyAndParseWebhook(input);
  if (parsed.outcome === "INVALID_SIGNATURE") {
    paymentError("WEBHOOK_INVALID_SIGNATURE", "Payment webhook could not be verified.");
  }
  const event = parsed.event;
  const payloadHash = createHash("sha256").update(input.body).digest("hex");
  const normalizedMoney = normalizedEventMoney(event.amount, event.currency);

  return runPaymentSerializable(async (transaction) => {
    const existing = await transaction.paymentProviderEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: provider.kind,
          providerEventId: event.eventId,
        },
      },
      include: { platformJob: { select: { id: true } } },
    });
    if (existing) {
      if (
        existing.payloadHash !== payloadHash
        || existing.providerReference !== event.providerReference
        || existing.normalizedType !== event.outcome
        || !sameOptionalDecimal(existing.normalizedAmount, normalizedMoney.amount)
        || existing.normalizedCurrency !== normalizedMoney.currency
      ) {
        paymentError("IDEMPOTENCY_CONFLICT", "Payment provider event ID was reused with changed content.");
      }
      let jobId = existing.platformJob?.id ?? null;
      if (!jobId && existing.status === "VERIFIED") {
        const recovered = await enqueueProviderEventPlatformJob(transaction, {
          availableAt: input.receivedAt,
          expectedVersion: existing.processingVersion,
          providerEventId: existing.id,
        });
        jobId = recovered.job.id;
      }
      return {
        duplicate: true,
        jobId,
        kind: "PAYMENT_PROVIDER_EVENT" as const,
        status: existing.status,
      };
    }

    const intent = await transaction.paymentIntent.findUnique({
      where: {
        provider_providerReference: {
          provider: provider.kind,
          providerReference: event.providerReference,
        },
      },
    });
    const providerEvent = await transaction.paymentProviderEvent.create({
      data: {
        id: randomUUID(),
        normalizedAmount: normalizedMoney.amount,
        normalizedCurrency: normalizedMoney.currency,
        normalizedType: event.outcome,
        occurredAt: event.occurredAt,
        payloadHash,
        paymentIntentId: intent?.id,
        provider: provider.kind,
        providerEventId: event.eventId,
        providerReference: event.providerReference,
        safeProviderCode: event.safeCode,
        status: "VERIFIED",
        verifiedAt: input.receivedAt,
      },
    });
    const enqueued = await enqueueProviderEventPlatformJob(transaction, {
      availableAt: input.receivedAt,
      expectedVersion: providerEvent.processingVersion,
      providerEventId: providerEvent.id,
    });
    return {
      duplicate: false,
      jobId: enqueued.job.id,
      kind: "PAYMENT_PROVIDER_EVENT" as const,
      status: "VERIFIED" as const,
    };
  });
}

export async function processVerifiedPaymentProviderEvent(input: {
  eventId: string;
  executionGuard: PaymentExecutionGuard;
  expectedVersion: number;
}) {
  return runPaymentSerializable(async (transaction) => {
    await input.executionGuard(transaction);
    await transaction.$queryRaw(Prisma.sql`
      SELECT event."id"
      FROM "PaymentProviderEvent" AS event
      WHERE event."id" = ${input.eventId}::uuid
      FOR UPDATE OF event
    `);
    const event = await transaction.paymentProviderEvent.findUnique({
      where: { id: input.eventId },
    });
    if (!event) return { outcome: "ABSENT" as const, state: "ABSENT" as const };
    if (event.processingVersion !== input.expectedVersion) {
      return { outcome: "STALE" as const, state: event.status };
    }
    if (["PROCESSED", "IGNORED"].includes(event.status)) {
      return { outcome: "COMPLETED" as const, state: event.status };
    }
    if (event.status !== "VERIFIED" || !event.verifiedAt) {
      return { outcome: "INELIGIBLE" as const, state: event.status };
    }
    if (!event.paymentIntentId) {
      await input.executionGuard(transaction);
      await transaction.paymentProviderEvent.update({
        where: { id: event.id },
        data: {
          processedAt: event.verifiedAt,
          processingVersion: { increment: 1 },
          status: "IGNORED",
        },
      });
      return { outcome: "COMPLETED" as const, state: "IGNORED" as const };
    }

    await lockPaymentIntent(transaction, event.paymentIntentId);
    const current = await transaction.paymentIntent.findUniqueOrThrow({
      where: { id: event.paymentIntentId },
    });
    let status: "PROCESSED" | "IGNORED" = "PROCESSED";
    await input.executionGuard(transaction);
    if (event.normalizedType === "CAPTURED") {
      if (!event.normalizedAmount || event.normalizedCurrency !== current.currency) {
        paymentError("PAYMENT_CURRENCY_MISMATCH", "Provider event currency is inconsistent.");
      }
      if (current.capturedAmount.equals(current.amount)) {
        status = "IGNORED";
      } else {
        await applyCapture(transaction, {
          amount: event.normalizedAmount,
          paymentIntentId: current.id,
          providerReference: event.providerReference,
          sourceId: event.id,
          now: event.verifiedAt,
        });
      }
    } else if (event.normalizedType === "AUTHORIZED") {
      if ([
        "AUTHORIZED",
        "PARTIALLY_CAPTURED",
        "CAPTURED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
        "FAILED",
        "CANCELLED",
        "EXPIRED",
      ].includes(current.status)) {
        status = "IGNORED";
      } else {
        assertPaymentIntentTransition(current.status, "AUTHORIZED");
        await transaction.paymentIntent.update({
          where: { id: current.id },
          data: {
            authorizedAt: event.verifiedAt,
            status: "AUTHORIZED",
            version: { increment: 1 },
          },
        });
      }
    } else if (event.normalizedType === "PERMANENT_FAILURE") {
      if (
        current.capturedAmount.greaterThan(0)
        || (current.authorizedAt !== null && event.occurredAt < current.authorizedAt)
        || ["FAILED", "CANCELLED", "EXPIRED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(current.status)
      ) {
        status = "IGNORED";
      } else {
        assertPaymentIntentTransition(current.status, "FAILED");
        await transaction.paymentIntent.update({
          where: { id: current.id },
          data: {
            failedAt: event.verifiedAt,
            status: "FAILED",
            version: { increment: 1 },
          },
        });
      }
    } else {
      status = "IGNORED";
    }
    await input.executionGuard(transaction);
    await transaction.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        processedAt: event.verifiedAt,
        processingVersion: { increment: 1 },
        status,
      },
    });
    return { outcome: "COMPLETED" as const, state: status };
  });
}

function normalizedEventMoney(amount: string | null, currency: string | null) {
  if (amount === null && currency === null) return { amount: null, currency: null };
  if (amount === null || currency === null) {
    paymentError("VALIDATION_ERROR", "Provider event money fields are incomplete.");
  }
  return {
    amount: paymentDecimal(amount, "event.amount"),
    currency: parsePaymentCurrency(currency),
  };
}

function sameOptionalDecimal(
  left: Prisma.Decimal | null,
  right: Prisma.Decimal | null,
) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}
