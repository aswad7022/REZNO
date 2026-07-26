import { randomUUID } from "node:crypto";
import type {
  PaymentMutation,
  PaymentProviderKind,
  Prisma,
} from "@prisma/client";

import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import {
  buildHostedCheckoutUrl,
  configuredHostedCheckoutPolicy,
  hostedPaymentReturnUrls,
} from "@/features/payments/domain/hosted-checkout";
import { paymentIntentDto, paymentIntentDtoInclude } from "@/features/payments/domain/dto";
import { paymentError } from "@/features/payments/domain/errors";
import {
  decodeHostedReturnState,
  encodeHostedReturnState,
} from "@/features/payments/domain/hosted-return-state";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import {
  lockPaymentIntent,
  runPaymentSerializable,
} from "@/features/payments/services/transaction";

const HANDOFF_TTL_MS = 5 * 60 * 1_000;
const HOSTED_HANDOFF_KIND = "HOSTED_PAYMENT_HANDOFF_V1";

type StoredHandoff = {
  actionReference: string;
  attemptId: string;
  expiresAt: string;
  kind: typeof HOSTED_HANDOFF_KIND;
};

export async function createCustomerHostedPaymentHandoff(
  customerPersonId: string,
  paymentIntentId: string,
  idempotencyKey: string,
) {
  const prepared = await runPaymentSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerPersonId, transaction);
    await lockPaymentIntent(transaction, paymentIntentId);
    const intent = await transaction.paymentIntent.findFirst({
      where: { customerPersonId, id: paymentIntentId },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    const actorKey = hostedActorKey(customerPersonId);
    const requestHash = hostedRequestHash(paymentIntentId);
    const replay = await transaction.paymentMutation.findUnique({
      where: {
        actorKey_idempotencyKey: {
          actorKey,
          idempotencyKey,
        },
      },
    });
    if (replay) {
      if (
        replay.action !== "CREATE_HOSTED_HANDOFF"
        || replay.paymentIntentId !== paymentIntentId
        || replay.requestHash !== requestHash
        || replay.status !== "PROCESSING"
      ) {
        paymentError(
          "IDEMPOTENCY_CONFLICT",
          "Hosted payment idempotency key was reused.",
        );
      }
      return handoffFromMutation(replay, intent.provider);
    }

    const attempt = intent.attempts[0];
    const now = new Date();
    if (
      intent.status !== "REQUIRES_ACTION"
      || !intent.expiresAt
      || intent.expiresAt <= now
      || !attempt
      || attempt.status !== "REQUIRES_ACTION"
      || !attempt.requiresAction
      || !attempt.actionReference
      || !attempt.actionExpiresAt
      || attempt.actionExpiresAt <= now
    ) {
      paymentError(
        "PAYMENT_STATE_CONFLICT",
        "Payment does not have an active hosted action.",
      );
    }
    // Resolve the exact source-controlled policy before persisting a handoff.
    // With no approved provider this fails closed and leaves no durable state.
    configuredHostedCheckoutPolicy(intent.provider);
    const expiresAt = new Date(
      Math.floor(Math.min(
        intent.expiresAt.getTime(),
        attempt.actionExpiresAt.getTime(),
        now.getTime() + HANDOFF_TTL_MS,
      ) / 1_000) * 1_000,
    );
    const mutation = await transaction.paymentMutation.create({
      data: {
        action: "CREATE_HOSTED_HANDOFF",
        actorKey,
        actorPersonId: customerPersonId,
        actorType: "CUSTOMER",
        id: randomUUID(),
        idempotencyKey,
        organizationId: intent.organizationId,
        paymentIntentId: intent.id,
        requestHash,
        result: {
          actionReference: attempt.actionReference,
          attemptId: attempt.id,
          expiresAt: expiresAt.toISOString(),
          kind: HOSTED_HANDOFF_KIND,
        },
        targetId: intent.orderId ?? intent.bookingId!,
        targetType: intent.orderId ? "ORDER" : "BOOKING",
      },
    });
    return handoffFromMutation(mutation, intent.provider);
  });

  const expiresAtEpoch = Math.floor(prepared.expiresAt.getTime() / 1_000);
  const state = encodeHostedReturnState({
    attemptId: prepared.attemptId,
    expiresAt: expiresAtEpoch,
    handoffId: prepared.handoffId,
    intentId: paymentIntentId,
    nonce: idempotencyKey,
    personId: customerPersonId,
  });
  const returnUrls = hostedPaymentReturnUrls(paymentIntentId, state);
  const policy = configuredHostedCheckoutPolicy(prepared.provider);
  return {
    kind: "HOSTED_PAYMENT_HANDOFF" as const,
    checkoutUrl: buildHostedCheckoutUrl({
      actionReference: prepared.actionReference,
      policy,
      returnUrls,
      state,
    }),
    expiresAt: prepared.expiresAt.toISOString(),
    intentId: paymentIntentId,
    returnUrls,
    state,
  };
}

export async function consumeCustomerHostedPaymentReturn(
  customerPersonId: string,
  paymentIntentId: string,
  state: string,
) {
  const now = new Date();
  const decoded = decodeHostedReturnState(state, {
    intentId: paymentIntentId,
    now,
    personId: customerPersonId,
  });
  const consumed = await runPaymentSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerPersonId, transaction);
    await lockPaymentIntent(transaction, paymentIntentId);
    const intent = await transaction.paymentIntent.findFirst({
      where: { customerPersonId, id: paymentIntentId },
      include: paymentIntentDtoInclude,
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    const [attempt, mutation] = await Promise.all([
      transaction.paymentAttempt.findFirst({
        where: {
          id: decoded.attemptId,
          paymentIntentId,
        },
      }),
      transaction.paymentMutation.findUnique({
        where: { id: decoded.handoffId },
      }),
    ]);
    const stored = mutation ? parseStoredHandoff(mutation.result) : null;
    if (
      !attempt
      || !mutation
      || !stored
      || mutation.action !== "CREATE_HOSTED_HANDOFF"
      || mutation.actorType !== "CUSTOMER"
      || mutation.actorPersonId !== customerPersonId
      || mutation.actorKey !== hostedActorKey(customerPersonId)
      || mutation.paymentIntentId !== paymentIntentId
      || mutation.idempotencyKey !== decoded.nonce
      || mutation.requestHash !== hostedRequestHash(paymentIntentId)
      || stored.attemptId !== decoded.attemptId
      || stored.expiresAt !== new Date(decoded.expiresAt * 1_000).toISOString()
    ) {
      paymentError(
        "VALIDATION_ERROR",
        "Hosted payment return state is invalid.",
      );
    }
    if (mutation.status !== "PROCESSING") {
      return { kind: "REPLAY" as const };
    }
    const updated = await transaction.paymentMutation.updateMany({
      where: {
        id: mutation.id,
        requestHash: mutation.requestHash,
        status: "PROCESSING",
      },
      data: {
        result: {
          ...stored,
          consumedAt: now.toISOString(),
          outcome: "RETURN_CONSUMED",
        },
        resultVersion: intent.version,
        status: "COMPLETED",
      },
    });
    if (updated.count !== 1) return { kind: "REPLAY" as const };
    return {
      kind: "CONSUMED" as const,
      payment: paymentIntentDto(intent),
    };
  });
  if (consumed.kind === "REPLAY") {
    paymentError(
      "PAYMENT_STATE_CONFLICT",
      "Hosted payment return was already consumed.",
    );
  }
  return consumed.payment;
}

function handoffFromMutation(
  mutation: PaymentMutation,
  provider: PaymentProviderKind,
) {
  const stored = parseStoredHandoff(mutation.result);
  if (!stored) {
    paymentError(
      "PAYMENT_STATE_CONFLICT",
      "Hosted payment handoff cannot be restored.",
    );
  }
  const expiresAt = new Date(stored.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    paymentError(
      "PAYMENT_STATE_CONFLICT",
      "Hosted payment handoff expired.",
    );
  }
  return {
    actionReference: stored.actionReference,
    attemptId: stored.attemptId,
    expiresAt,
    handoffId: mutation.id,
    provider,
  };
}

function parseStoredHandoff(value: Prisma.JsonValue | null): StoredHandoff | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    item.kind !== HOSTED_HANDOFF_KIND
    || typeof item.actionReference !== "string"
    || !/^[A-Za-z0-9._~-]{1,240}$/.test(item.actionReference)
    || typeof item.attemptId !== "string"
    || typeof item.expiresAt !== "string"
  ) {
    return null;
  }
  return {
    actionReference: item.actionReference,
    attemptId: item.attemptId,
    expiresAt: item.expiresAt,
    kind: HOSTED_HANDOFF_KIND,
  };
}

function hostedActorKey(personId: string) {
  return `customer:${personId}:hosted-return`;
}

function hostedRequestHash(paymentIntentId: string) {
  return paymentRequestHash({
    intentId: paymentIntentId,
    kind: HOSTED_HANDOFF_KIND,
  });
}
