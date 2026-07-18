import "server-only";

import type { Prisma } from "@prisma/client";

import type { NotificationActorContext } from "@/features/notifications/domain/contracts";
import { notificationError } from "@/features/notifications/domain/errors";

export async function assertNotificationActorCurrent(
  transaction: Prisma.TransactionClient,
  context: NotificationActorContext,
) {
  const person = await transaction.person.findFirst({
    where: { id: context.personId, deletedAt: null, isOnboarded: true, status: "ACTIVE" },
    select: { id: true },
  });
  if (!person) notificationError("FORBIDDEN", "An active Notification Person is required.");
  if (context.mode === "customer") return;
  const membership = await transaction.organizationMember.findFirst({
    where: {
      id: context.membershipId,
      personId: context.personId,
      organizationId: context.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      role: { organizationId: context.organizationId, systemRole: context.role },
    },
    select: { id: true },
  });
  if (!membership) notificationError("FORBIDDEN", "The active Business Notification scope changed.");
}
