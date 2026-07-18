import "server-only";

import type { Prisma } from "@prisma/client";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { effectiveCommercePermissions } from "@/features/commerce/domain/merchant-access";
import type { NotificationActorContext } from "@/features/notifications/domain/contracts";
import { notificationError } from "@/features/notifications/domain/errors";

export async function assertNotificationActorCurrent(
  transaction: Prisma.TransactionClient,
  context: NotificationActorContext,
): Promise<NotificationActorContext> {
  const person = await transaction.person.findFirst({
    where: { id: context.personId, deletedAt: null, isOnboarded: true, status: "ACTIVE" },
    select: { id: true },
  });
  if (!person) notificationError("FORBIDDEN", "An active Notification Person is required.");
  if (context.mode === "customer") return context;
  const membership = await transaction.organizationMember.findFirst({
    where: {
      id: context.membershipId,
      personId: context.personId,
      organizationId: context.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      roleId: context.roleId,
      role: { id: context.roleId, organizationId: context.organizationId, systemRole: context.systemRole },
    },
    select: {
      id: true,
      organization: { select: { vertical: true } },
      role: { select: { commercePermissions: true, id: true, systemRole: true } },
    },
  });
  if (!membership) notificationError("FORBIDDEN", "The active Business Notification scope changed.");
  if (!membership.role.systemRole) notificationError("FORBIDDEN", "A current system Business role is required.");
  return {
    effectiveCommercePermissions: effectiveCommercePermissions(membership.role),
    membershipId: membership.id,
    mode: "business",
    organizationId: context.organizationId,
    personId: context.personId,
    restaurant: isRestaurantVertical(membership.organization.vertical),
    roleId: membership.role.id,
    systemRole: membership.role.systemRole,
  };
}
