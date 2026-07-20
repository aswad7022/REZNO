import "server-only";

import type { Prisma } from "@prisma/client";

import { effectiveCommercePermissions } from "@/features/commerce/domain/merchant-access";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";
import { paymentMoneyString, paymentSignedMoneyString } from "@/features/payments/domain/money";

type Transaction = Prisma.TransactionClient;

export async function notifyPaymentCaptured(
  transaction: Transaction,
  input: { amount: Prisma.Decimal; currency: string; eventId: string; paymentIntentId: string },
) {
  const audience = await paymentAudience(transaction, input.paymentIntentId);
  const amount = paymentMoneyString(input.amount);
  await createCanonicalNotifications(transaction, [
    directPaymentEvent({
      body: `Payment of ${amount} ${input.currency} was captured.`,
      eventId: input.eventId,
      eventType: "payment.captured",
      organizationId: audience.organizationId,
      paymentIntentId: input.paymentIntentId,
      personId: audience.customerPersonId,
      title: "Payment captured",
    }),
    ...audience.merchantPersonIds.map((personId) => directPaymentEvent({
      body: `A payment of ${amount} ${input.currency} was captured.`,
      destination: "BUSINESS_PAYMENTS",
      eventId: input.eventId,
      eventType: "payment.captured",
      organizationId: audience.organizationId,
      paymentIntentId: input.paymentIntentId,
      personId,
      title: "Payment captured",
    })),
  ]);
}

export async function notifyPaymentFailed(
  transaction: Transaction,
  input: { eventId: string; paymentIntentId: string },
) {
  const intent = await transaction.paymentIntent.findUniqueOrThrow({
    where: { id: input.paymentIntentId },
    select: { customerPersonId: true, organizationId: true },
  });
  await createCanonicalNotifications(transaction, [directPaymentEvent({
    body: "The payment attempt was not completed. You can review its status and retry if available.",
    eventId: input.eventId,
    eventType: "payment.failed",
    organizationId: intent.organizationId,
    paymentIntentId: input.paymentIntentId,
    personId: intent.customerPersonId,
    title: "Payment not completed",
  })]);
}

export async function notifyRefundResult(
  transaction: Transaction,
  input: { amount: Prisma.Decimal; currency: string; paymentIntentId: string; refundId: string; succeeded: boolean },
) {
  const audience = await paymentAudience(transaction, input.paymentIntentId);
  const amount = paymentMoneyString(input.amount);
  const eventType = input.succeeded ? "payment.refund_succeeded" : "payment.refund_failed";
  const title = input.succeeded ? "Refund completed" : "Refund not completed";
  const customerBody = input.succeeded
    ? `A refund of ${amount} ${input.currency} was completed.`
    : `The refund of ${amount} ${input.currency} was not completed.`;
  await createCanonicalNotifications(transaction, [
    directRefundEvent({
      body: customerBody,
      eventType,
      organizationId: audience.organizationId,
      paymentIntentId: input.paymentIntentId,
      personId: audience.customerPersonId,
      refundId: input.refundId,
      title,
    }),
    ...audience.merchantPersonIds.map((personId) => directRefundEvent({
      body: customerBody,
      destination: "BUSINESS_PAYMENTS",
      eventType,
      organizationId: audience.organizationId,
      paymentIntentId: input.paymentIntentId,
      personId,
      refundId: input.refundId,
      title,
    })),
  ]);
}

export async function notifySettlementFinalized(
  transaction: Transaction,
  input: { batchId: string; currency: string; merchantNet: Prisma.Decimal; organizationId: string },
) {
  const recipients = await merchantRecipients(transaction, input.organizationId, "SETTLEMENT_VIEW");
  const amount = paymentSignedMoneyString(input.merchantNet);
  await createCanonicalNotifications(transaction, recipients.map((personId) => ({
    audience: "USER" as const,
    body: `A ledger settlement statement with merchant net ${amount} ${input.currency} was finalized. This is not confirmation of a bank payout.`,
    businessId: input.organizationId,
    category: "PAYMENTS" as const,
    destinationKind: "BUSINESS_PAYMENTS" as const,
    destinationTargetId: input.batchId,
    eventKey: `payments:settlement:${input.batchId}:finalized:${personId}`,
    eventType: "payment.settlement_finalized",
    mandatory: false,
    priority: "NORMAL" as const,
    recipientPersonId: personId,
    sourceId: input.batchId,
    sourceType: "SETTLEMENT_BATCH" as const,
    title: "Settlement statement finalized",
  })));
}

async function paymentAudience(transaction: Transaction, paymentIntentId: string) {
  const intent = await transaction.paymentIntent.findUniqueOrThrow({
    where: { id: paymentIntentId },
    select: { customerPersonId: true, organizationId: true },
  });
  return {
    ...intent,
    merchantPersonIds: await merchantRecipients(transaction, intent.organizationId, "PAYMENT_VIEW"),
  };
}

async function merchantRecipients(
  transaction: Transaction,
  organizationId: string,
  permission: "PAYMENT_VIEW" | "SETTLEMENT_VIEW",
) {
  const memberships = await transaction.organizationMember.findMany({
    where: {
      deletedAt: null,
      organizationId,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      role: { organizationId },
    },
    select: { personId: true, role: { select: { commercePermissions: true, systemRole: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return memberships
    .filter((membership) => effectiveCommercePermissions(membership.role).includes(permission))
    .map((membership) => membership.personId);
}

function directPaymentEvent(input: {
  body: string;
  destination?: "BUSINESS_PAYMENTS";
  eventId: string;
  eventType: string;
  organizationId: string;
  paymentIntentId: string;
  personId: string;
  title: string;
}) {
  return {
    audience: "USER" as const,
    body: input.body,
    businessId: input.destination ? input.organizationId : undefined,
    category: "PAYMENTS" as const,
    destinationKind: input.destination ?? "CUSTOMER_PAYMENT" as const,
    destinationTargetId: input.paymentIntentId,
    eventKey: `payments:intent:${input.paymentIntentId}:${input.eventType}:${input.eventId}:${input.personId}`,
    eventType: input.eventType,
    mandatory: false,
    priority: "IMPORTANT" as const,
    recipientPersonId: input.personId,
    sourceId: input.paymentIntentId,
    sourceType: "PAYMENT_INTENT" as const,
    title: input.title,
  };
}

function directRefundEvent(input: {
  body: string;
  destination?: "BUSINESS_PAYMENTS";
  eventType: string;
  organizationId: string;
  paymentIntentId: string;
  personId: string;
  refundId: string;
  title: string;
}) {
  return {
    audience: "USER" as const,
    body: input.body,
    businessId: input.destination ? input.organizationId : undefined,
    category: "PAYMENTS" as const,
    destinationKind: input.destination ?? "CUSTOMER_PAYMENT" as const,
    destinationTargetId: input.paymentIntentId,
    eventKey: `payments:refund:${input.refundId}:${input.eventType}:${input.personId}`,
    eventType: input.eventType,
    mandatory: false,
    priority: input.eventType === "payment.refund_succeeded" ? "IMPORTANT" as const : "NORMAL" as const,
    recipientPersonId: input.personId,
    sourceId: input.refundId,
    sourceType: "PAYMENT_REFUND" as const,
    title: input.title,
  };
}
