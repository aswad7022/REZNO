import type { LanguageCode, Prisma } from "@prisma/client";

import {
  commerceNotificationCopy,
  type CommerceNotificationEvent,
} from "@/features/commerce/domain/notification-events";
import { effectiveCommercePermissions } from "@/features/commerce/domain/merchant-access";

type Transaction = Prisma.TransactionClient;

export async function notifyCheckoutCreated(transaction: Transaction, orderId: string) {
  await notifyCustomer(transaction, orderId, "order.created");
  await notifyEligibleMerchants(transaction, orderId, "order.new");
}

export async function notifyCustomerOrderEvent(
  transaction: Transaction,
  orderId: string,
  event: Exclude<CommerceNotificationEvent, "order.new" | "order.customer_cancelled">,
) {
  await notifyCustomer(transaction, orderId, event);
}

export async function notifyCustomerCancellation(transaction: Transaction, orderId: string) {
  await notifyCustomer(transaction, orderId, "order.cancelled");
  await notifyEligibleMerchants(transaction, orderId, "order.customer_cancelled");
}

export async function notifyAdministrativeOrderCancellation(transaction: Transaction, orderId: string) {
  await notifyCustomer(transaction, orderId, "order.cancelled");
  await notifyEligibleMerchants(transaction, orderId, "order.admin_cancelled");
}

export async function notifyOrderExpired(transaction: Transaction, orderId: string) {
  await notifyCustomer(transaction, orderId, "order.expired");
  await notifyEligibleMerchants(transaction, orderId, "order.expired");
}

async function notifyCustomer(
  transaction: Transaction,
  orderId: string,
  event: Exclude<CommerceNotificationEvent, "order.new" | "order.customer_cancelled">,
) {
  const order = await transaction.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      customer: { select: { id: true, preferredLanguage: true } },
      orderNumber: true,
      storeNameSnapshot: true,
    },
  });
  await createNotifications(transaction, orderId, event, order.orderNumber, order.storeNameSnapshot, [
    order.customer,
  ], "customer");
}

async function notifyEligibleMerchants(
  transaction: Transaction,
  orderId: string,
  event: "order.new" | "order.customer_cancelled" | "order.admin_cancelled" | "order.expired",
) {
  const order = await transaction.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      store: { select: { organizationId: true } },
      storeNameSnapshot: true,
    },
  });
  const members = await transaction.organizationMember.findMany({
    where: {
      organizationId: order.store.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      role: { organizationId: order.store.organizationId },
    },
    select: {
      person: { select: { id: true, preferredLanguage: true } },
      role: { select: { commercePermissions: true, systemRole: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  await createNotifications(
    transaction,
    orderId,
    event,
    order.orderNumber,
    order.storeNameSnapshot,
    members
      .filter((member) => effectiveCommercePermissions(member.role).includes("ORDER_VIEW"))
      .map((member) => member.person),
    "merchant",
  );
}

async function createNotifications(
  transaction: Transaction,
  orderId: string,
  event: CommerceNotificationEvent,
  orderNumber: string,
  storeName: string,
  recipients: Array<{ id: string; preferredLanguage: LanguageCode }>,
  destinationType: "customer" | "merchant",
) {
  if (recipients.length === 0) return;
  await transaction.notification.createMany({
    data: recipients.map((recipient) => {
      const copy = commerceNotificationCopy(event, recipient.preferredLanguage, orderNumber, storeName);
      return {
        audience: "USER" as const,
        body: copy.body,
        eventKey: commerceNotificationEventKey(orderId, event, recipient.id, destinationType),
        metadata: {
          bodyKey: copy.bodyKey,
          destination: destinationType === "merchant"
            ? `/business/commerce/orders/${orderId}`
            : "/customer/notifications",
          ...(destinationType === "customer" ? { orderDestination: `/customer/orders/${orderId}` } : {}),
          eventType: event,
          orderId,
          orderNumber,
          status: event.replace("order.", ""),
          storeName,
          titleKey: copy.titleKey,
        },
        priority: event === "order.new" || event === "order.rejected" ? "IMPORTANT" as const : "NORMAL" as const,
        recipientPersonId: recipient.id,
        title: copy.title,
      };
    }),
    skipDuplicates: true,
  });
}

export function commerceNotificationEventKey(
  orderId: string,
  event: CommerceNotificationEvent,
  recipientPersonId: string,
  destinationType: "customer" | "merchant" = "customer",
) {
  return destinationType === "merchant"
    ? `commerce:${orderId}:${event}:merchant:${recipientPersonId}`
    : `commerce:${orderId}:${event}:${recipientPersonId}`;
}
