import type { Prisma } from "@prisma/client";

import type { NotificationActorContext } from "@/features/notifications/domain/contracts";

export function notificationVisibilityWhere(
  context: NotificationActorContext,
): Prisma.NotificationWhereInput {
  if (context.mode === "customer") {
    return {
      OR: [
        { audience: "ALL" },
        { audience: "CUSTOMERS" },
        { audience: "USER", recipientPersonId: context.personId },
      ],
    };
  }
  const organizationUpdates =
    context.systemRole === "OWNER" || context.systemRole === "MANAGER" || context.systemRole === "RECEPTIONIST";
  return {
    OR: [
      { audience: "ALL" },
      { audience: "USER", recipientPersonId: context.personId },
      ...(context.systemRole === "OWNER" ? [{ audience: "BUSINESS_OWNERS" as const }] : []),
      ...(organizationUpdates && context.organizationId
        ? [
            { audience: "BUSINESS" as const, businessId: context.organizationId },
            ...(context.restaurant ? [{ audience: "RESTAURANTS" as const }] : []),
          ]
        : []),
    ],
  };
}

export function canReceiveOrganizationNotifications(context: NotificationActorContext) {
  return context.mode === "business" &&
    (context.systemRole === "OWNER" || context.systemRole === "MANAGER" || context.systemRole === "RECEPTIONIST");
}
