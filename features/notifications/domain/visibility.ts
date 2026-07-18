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
    context.role === "OWNER" || context.role === "MANAGER" || context.role === "RECEPTIONIST";
  return {
    OR: [
      { audience: "ALL" },
      { audience: "USER", recipientPersonId: context.personId },
      ...(context.role === "OWNER" ? [{ audience: "BUSINESS_OWNERS" as const }] : []),
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
    (context.role === "OWNER" || context.role === "MANAGER" || context.role === "RECEPTIONIST");
}
