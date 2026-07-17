import type { Prisma, SystemRole } from "@prisma/client";

export function businessNotificationWhere(input: {
  organizationId: string;
  personId: string;
  restaurant: boolean;
  role: SystemRole | null;
}): Prisma.NotificationWhereInput {
  const canReceiveOrganizationUpdates =
    input.role === "OWNER" ||
    input.role === "MANAGER" ||
    input.role === "RECEPTIONIST";
  return {
    OR: [
      { audience: "ALL" },
      { audience: "USER", recipientPersonId: input.personId },
      ...(input.role === "OWNER"
        ? ([{ audience: "BUSINESS_OWNERS" as const }] as const)
        : []),
      ...(canReceiveOrganizationUpdates
        ? ([
            { audience: "BUSINESS" as const, businessId: input.organizationId },
            ...(input.restaurant
              ? ([{ audience: "RESTAURANTS" as const }] as const)
              : []),
          ] as const)
        : []),
    ],
  };
}
