import "server-only";

import type { DashboardRole } from "@/types/dashboard";
import type { DashboardNotification } from "@/features/notifications/types";
import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { businessNotificationWhere } from "@/features/notifications/domain/business-notification-policy";
import { prisma } from "@/lib/db/prisma";

export async function getDashboardNotifications(
  role: DashboardRole,
  take = 8,
): Promise<DashboardNotification[]> {
  let organizationId: string | undefined;
  let memberId: string | undefined;
  let personId: string;
  let includeRestaurantNotifications = false;
  let businessRole: "OWNER" | "MANAGER" | "RECEPTIONIST" | "STAFF" | null = null;
  if (role === "business") {
    const identity = await requireBusinessIdentity();
    organizationId = identity.membership.organizationId;
    memberId =
      identity.membership.role.systemRole === "STAFF"
        ? identity.membership.id
        : undefined;
    personId = identity.person.id;
    businessRole = identity.membership.role.systemRole;
    includeRestaurantNotifications = isRestaurantVertical(
      identity.membership.organization.vertical,
    );
  } else {
    const identity = await requireCustomerIdentity();
    personId = identity.person.id;
  }

  const notificationWhere =
    role === "business"
      ? businessNotificationWhere({
          organizationId: organizationId!,
          personId,
          restaurant: includeRestaurantNotifications,
          role: businessRole,
        })
      : {
          OR: [
            { audience: "ALL" as const },
            { audience: "CUSTOMERS" as const },
            { audience: "USER" as const, recipientPersonId: personId },
          ],
        };

  const [history, changeRequests, adminNotifications] = await Promise.all([
    prisma.bookingStatusHistory.findMany({
    where: {
      booking:
        role === "business"
          ? { organizationId, ...(memberId ? { memberId } : {}) }
          : { customerId: personId },
    },
    include: {
      booking: {
        select: {
          id: true,
          serviceNameSnapshot: true,
          customerNameSnapshot: true,
          review: { select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
      take,
    }),
    role === "customer"
      ? prisma.bookingChangeRequest.findMany({
          where: {
            status: "PENDING",
            booking: { customerId: personId },
          },
          include: {
            booking: {
              select: {
                serviceNameSnapshot: true,
                customerNameSnapshot: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    prisma.notification.findMany({
      where: notificationWhere,
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  return [
    ...history.map((item) => ({
      id: item.id,
      status: item.toStatus,
      serviceName: item.booking.serviceNameSnapshot,
      customerName: item.booking.customerNameSnapshot,
      createdAt: item.createdAt.toISOString(),
      href: `/${role}/bookings`,
      kind:
        role === "customer" &&
        item.toStatus === "COMPLETED" &&
        !item.booking.review
          ? ("REVIEW_REQUEST" as const)
          : ("BOOKING_STATUS" as const),
    })),
    ...changeRequests.map((item) => ({
      id: item.id,
      status: "CONFIRMED" as const,
      serviceName: item.booking.serviceNameSnapshot,
      customerName: item.booking.customerNameSnapshot,
      createdAt: item.createdAt.toISOString(),
      href: "/customer/bookings",
      kind: "CHANGE_REQUEST" as const,
    })),
    ...adminNotifications.map((item) => ({
      id: item.id,
      serviceName: item.title,
      customerName: "",
      title: item.title,
      body: item.body,
      priority: item.priority,
      createdAt: item.createdAt.toISOString(),
      href: `/${role}/notifications`,
      kind: "ADMIN_ANNOUNCEMENT" as const,
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, take);
}
