import { createHash, randomUUID } from "node:crypto";

import { paymentError } from "@/features/payments/domain/errors";
import { parsePaymentCurrency, paymentDecimal } from "@/features/payments/domain/money";
import { assertPaymentIntentTransition } from "@/features/payments/domain/state-machine";
import { applyCapture } from "@/features/payments/services/payment-intents";
import { lockPaymentIntent, runPaymentSerializable } from "@/features/payments/services/transaction";
import { paymentProvider } from "@/features/payments/providers/registry";
import type { SafeWebhookInput } from "@/features/payments/providers/provider";

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
  return runPaymentSerializable(async (transaction) => {
    const replay = await transaction.paymentProviderEvent.findUnique({
      where: { provider_providerEventId: { provider: provider.kind, providerEventId: event.eventId } },
    });
    if (replay) {
      if (replay.payloadHash !== payloadHash || replay.providerReference !== event.providerReference) {
        paymentError("IDEMPOTENCY_CONFLICT", "Payment provider event ID was reused with changed content.");
      }
      return { kind: "PAYMENT_PROVIDER_EVENT" as const, duplicate: true, status: replay.status };
    }
    const intent = await transaction.paymentIntent.findUnique({
      where: { provider_providerReference: { provider: provider.kind, providerReference: event.providerReference } },
    });
    const providerEvent = await transaction.paymentProviderEvent.create({
      data: {
        id: randomUUID(),
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
    if (!intent) {
      await transaction.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: { processedAt: input.receivedAt, status: "IGNORED" },
      });
      return { kind: "PAYMENT_PROVIDER_EVENT" as const, duplicate: false, status: "IGNORED" as const };
    }
    await lockPaymentIntent(transaction, intent.id);
    const current = await transaction.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
    let status: "PROCESSED" | "IGNORED" = "PROCESSED";
    if (event.outcome === "CAPTURED") {
      if (!event.amount || event.currency !== current.currency) {
        paymentError("PAYMENT_CURRENCY_MISMATCH", "Provider event currency is inconsistent.");
      }
      parsePaymentCurrency(event.currency);
      const amount = paymentDecimal(event.amount, "event.amount");
      if (current.capturedAmount.equals(current.amount)) {
        status = "IGNORED";
      } else {
        await applyCapture(transaction, {
          amount,
          paymentIntentId: current.id,
          providerReference: event.providerReference,
          sourceId: providerEvent.id,
          now: input.receivedAt,
        });
      }
    } else if (event.outcome === "AUTHORIZED") {
      if (["AUTHORIZED", "PARTIALLY_CAPTURED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "CANCELLED", "EXPIRED"].includes(current.status)) {
        status = "IGNORED";
      } else {
        assertPaymentIntentTransition(current.status, "AUTHORIZED");
        await transaction.paymentIntent.update({
          where: { id: current.id },
          data: { authorizedAt: input.receivedAt, status: "AUTHORIZED", version: { increment: 1 } },
        });
      }
    } else if (event.outcome === "PERMANENT_FAILURE") {
      if (current.capturedAmount.isPositive() || ["FAILED", "CANCELLED", "EXPIRED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(current.status)) {
        status = "IGNORED";
      } else {
        assertPaymentIntentTransition(current.status, "FAILED");
        await transaction.paymentIntent.update({
          where: { id: current.id },
          data: { failedAt: input.receivedAt, status: "FAILED", version: { increment: 1 } },
        });
      }
    } else {
      status = "IGNORED";
    }
    await transaction.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: { processedAt: input.receivedAt, status },
    });
    return { kind: "PAYMENT_PROVIDER_EVENT" as const, duplicate: false, status };
  });
}
