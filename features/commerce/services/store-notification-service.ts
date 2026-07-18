import type { Prisma } from "@prisma/client";

import {
  storeNotificationCopy,
  storeNotificationEventKey,
  type StoreNotificationEvent,
} from "@/features/commerce/domain/store-notification-events";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";

export async function notifyStoreLifecycle(
  transaction: Prisma.TransactionClient,
  input: {
    event: StoreNotificationEvent;
    organizationId: string;
    resultVersion: Date;
    storeId: string;
  },
) {
  const recipients = input.event === "store.submitted"
    ? await adminReviewRecipients(transaction)
    : await ownerRecipients(transaction, input.organizationId);
  if (recipients.length === 0) return;
  await createCanonicalNotifications(
    transaction,
    recipients.map((recipient) => {
      const copy = storeNotificationCopy(input.event, recipient.preferredLanguage);
      return {
        audience: "USER" as const,
        body: copy.body,
        bodyKey: `commerce.${input.event}.body`,
        category: "COMMERCE" as const,
        destinationKind: input.event === "store.submitted" ? "ADMIN_COMMERCE_STORES" as const : "BUSINESS_NOTIFICATIONS" as const,
        eventKey: storeNotificationEventKey({ ...input, recipientPersonId: recipient.id }),
        eventType: input.event,
        mandatory: input.event === "store.rejected" || input.event === "store.suspended",
        priority: input.event === "store.rejected" || input.event === "store.suspended"
          ? "IMPORTANT" as const
          : "NORMAL" as const,
        recipientPersonId: recipient.id,
        sourceId: input.storeId,
        sourceType: "STORE" as const,
        title: copy.title,
        titleKey: `commerce.${input.event}.title`,
      };
    }),
  );
}

async function ownerRecipients(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const rows = await transaction.organizationMember.findMany({
    where: {
      deletedAt: null,
      organizationId,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      role: { organizationId, systemRole: "OWNER" },
    },
    select: { person: { select: { id: true, preferredLanguage: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => row.person);
}

async function adminReviewRecipients(transaction: Prisma.TransactionClient) {
  const access = await transaction.adminAccess.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
      AND: [{ OR: [{ role: "SUPER_ADMIN" }, { permissions: { has: "COMMERCE_STORES_REVIEW" } }] }],
    },
    select: { userId: true },
    orderBy: { userId: "asc" },
  });
  if (access.length === 0) return [];
  return transaction.person.findMany({
    where: {
      authUserId: { in: access.map((row) => row.userId) },
      deletedAt: null,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true, preferredLanguage: true },
    orderBy: { id: "asc" },
  });
}
