import type { LanguageCode, Prisma } from "@prisma/client";

import {
  commerceNotificationCopy,
  type CommerceNotificationEvent,
} from "@/features/commerce/domain/notification-events";

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
  ]);
}

async function notifyEligibleMerchants(
  transaction: Transaction,
  orderId: string,
  event: "order.new" | "order.customer_cancelled",
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
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      role: {
        commercePermissions: { hasSome: ["ORDER_VIEW", "ORDER_MANAGE"] },
        organizationId: order.store.organizationId,
      },
    },
    select: { person: { select: { id: true, preferredLanguage: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  await createNotifications(
    transaction,
    orderId,
    event,
    order.orderNumber,
    order.storeNameSnapshot,
    members.map((member) => member.person),
  );
}

async function createNotifications(
  transaction: Transaction,
  orderId: string,
  event: CommerceNotificationEvent,
  orderNumber: string,
  storeName: string,
  recipients: Array<{ id: string; preferredLanguage: LanguageCode }>,
) {
  if (recipients.length === 0) return;
  await transaction.notification.createMany({
    data: recipients.map((recipient) => {
      const copy = commerceNotificationCopy(event, recipient.preferredLanguage, orderNumber, storeName);
      return {
        audience: "USER" as const,
        body: copy.body,
        eventKey: commerceNotificationEventKey(orderId, event, recipient.id),
        metadata: {
          bodyKey: copy.bodyKey,
          destination: event === "order.new" || event === "order.customer_cancelled"
            ? "/business/notifications"
            : "/customer/notifications",
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
) {
  return `commerce:${orderId}:${event}:${recipientPersonId}`;
}
