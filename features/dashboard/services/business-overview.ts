import "server-only";

import { Prisma, type BookingStatus, type BusinessVertical, type SystemRole } from "@prisma/client";

import {
  ACTIVE_OPERATIONAL_BOOKING_STATUSES,
  branchCompletedPeriodRange,
  branchLocalDayRange,
  branchRangeWhere,
  businessOverviewScope,
  businessQuickActions,
  type BusinessQuickAction,
} from "@/features/business-operations/domain/closure";
import type { BusinessOperationActorReference } from "@/features/business-operations/services/context";
import { resolveBusinessOperationActor } from "@/features/business-operations/services/context";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { getBusinessReadiness, type BusinessSetupStatus } from "@/features/dashboard/services/business-setup";
import { businessNotificationWhere } from "@/features/notifications/domain/business-notification-policy";
import { prisma } from "@/lib/db/prisma";

interface SafeOverviewBooking {
  branchName: string;
  id: string;
  serviceName: string;
  startsAt: Date;
  status: BookingStatus;
  timezone: string;
  type: "restaurant" | "service";
}

interface OverviewBase {
  quickActions: BusinessQuickAction[];
  recentBookings: SafeOverviewBooking[];
  snapshotAt: string;
}

export interface ManagementBusinessOverview extends OverviewBase {
  organizationName: string;
  readiness: BusinessSetupStatus;
  role: "OWNER" | "MANAGER";
  scope: "MANAGEMENT";
  vertical: BusinessVertical;
  metrics: {
    activeBranches: number;
    activeMenuItems: number | null;
    activeRestaurantTables: number | null;
    activeServices: number | null;
    activeWorkforce: number;
    cancellationsToday: number;
    completedToday: number;
    noShowsToday: number;
    operationalUpdatesLast24Hours: number;
    pendingChangeRequests: number;
    pendingConfirmations: number;
    reviewsAwaitingReply: number;
    todayActive: number;
    upcomingActive: number;
  };
}

export interface ReceptionistBusinessOverview extends OverviewBase {
  role: "RECEPTIONIST";
  scope: "RECEPTIONIST";
  vertical: BusinessVertical;
  metrics: {
    pendingChangeRequests: number;
    pendingConfirmations: number;
    restaurantReservationsToday: number | null;
    todayActive: number;
    upcomingActive: number;
  };
}

export interface StaffSelfBusinessOverview extends OverviewBase {
  role: "STAFF";
  scope: "STAFF_SELF";
  metrics: {
    ownCompletedLast7Days: number;
    ownNoShowsLast7Days: number;
    ownToday: number;
    ownUpcoming: number;
  };
  selfCalendarHref: "/business/calendar";
}

export type BusinessOverview =
  | ManagementBusinessOverview
  | ReceptionistBusinessOverview
  | StaffSelfBusinessOverview;

function impossibleBookingWhere(): Prisma.BookingWhereInput {
  return { branchId: { in: [] } };
}

function bookingScopeWhere(input: {
  branchIds: string[];
  memberId: string;
  organizationId: string;
  role: SystemRole;
}): Prisma.BookingWhereInput {
  if (input.branchIds.length === 0) return impossibleBookingWhere();
  return {
    organizationId: input.organizationId,
    branchId: { in: input.branchIds },
    ...(input.role === "STAFF"
      ? {
          memberId: input.memberId,
          restaurantReservation: { is: null },
        }
      : {}),
  };
}

function countStatuses(
  grouped: Array<{ _count: { _all: number }; status: BookingStatus }>,
) {
  return new Map(grouped.map((row) => [row.status, row._count._all]));
}

function safeBooking(booking: {
  branch: { name: string; timezone: string };
  id: string;
  restaurantReservation: { id: string } | null;
  serviceNameSnapshot: string;
  startsAt: Date;
  status: BookingStatus;
}): SafeOverviewBooking {
  return {
    branchName: booking.branch.name,
    id: booking.id,
    serviceName: booking.serviceNameSnapshot,
    startsAt: booking.startsAt,
    status: booking.status,
    timezone: booking.branch.timezone,
    type: booking.restaurantReservation ? "restaurant" : "service",
  };
}

async function countPendingCustomerChanges(input: {
  branchIds: string[];
  organizationId: string;
  snapshotAt: Date;
}) {
  if (input.branchIds.length === 0) return 0;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "BookingChangeRequest" AS change
    INNER JOIN "Booking" AS booking ON booking."id" = change."bookingId"
    WHERE change."status" = 'PENDING'::"BookingChangeRequestStatus"
      AND change."requestedByPersonId" = booking."customerId"
      AND booking."organizationId" = ${input.organizationId}::uuid
      AND booking."branchId" IN (${Prisma.join(input.branchIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND change."createdAt" <= ${input.snapshotAt}::timestamptz
      AND booking."createdAt" <= ${input.snapshotAt}::timestamptz
  `);
  return rows[0] ? Number(rows[0].count) : 0;
}

export async function getBusinessOverview(
  reference: BusinessOperationActorReference,
  snapshotAt = new Date(),
): Promise<BusinessOverview> {
  const actor = await resolveBusinessOperationActor(
    reference,
    "BUSINESS_OVERVIEW_READ",
  );
  const scope = businessOverviewScope(actor.role);
  const organization = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { vertical: true },
  });
  if (!organization) {
    throw new Error("Active business is unavailable.");
  }
  const branchWhere: Prisma.BranchWhereInput = {
    deletedAt: null,
    organizationId: actor.organizationId,
    status: "ACTIVE",
    ...(scope === "STAFF_SELF"
      ? { assignments: { some: { memberId: actor.membershipId } } }
      : {}),
  };
  const branches = await prisma.branch.findMany({
    where: branchWhere,
    select: { id: true, timezone: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const branchIds = branches.map((branch) => branch.id);
  const scopeWhere = bookingScopeWhere({
    branchIds,
    memberId: actor.membershipId,
    organizationId: actor.organizationId,
    role: actor.role,
  });
  const todayWhere: Prisma.BookingWhereInput = {
    AND: [
      scopeWhere,
      branchIds.length
        ? { OR: branchRangeWhere(branches.map((branch) => branchLocalDayRange(branch, snapshotAt))) }
        : impossibleBookingWhere(),
      { createdAt: { lte: snapshotAt } },
    ],
  };
  const upcomingWhere: Prisma.BookingWhereInput = {
    AND: [
      scopeWhere,
      { startsAt: { gte: snapshotAt } },
      { status: { in: [...ACTIVE_OPERATIONAL_BOOKING_STATUSES] } },
      { createdAt: { lte: snapshotAt } },
    ],
  };
  const quickActions = businessQuickActions({
    membershipId: actor.membershipId,
    role: actor.role,
    vertical: organization.vertical,
  });

  if (scope === "STAFF_SELF") {
    const completedRanges = branches.map((branch) =>
      branchCompletedPeriodRange(branch, snapshotAt, 7),
    );
    const recentWhere: Prisma.BookingWhereInput = {
      AND: [
        scopeWhere,
        completedRanges.length
          ? { OR: branchRangeWhere(completedRanges) }
          : impossibleBookingWhere(),
        { status: { in: ["COMPLETED", "NO_SHOW"] } },
        { createdAt: { lte: snapshotAt } },
      ],
    };
    const [todayGrouped, ownUpcoming, recentGrouped, bookings] = await Promise.all([
      prisma.booking.groupBy({
        by: ["status"],
        where: todayWhere,
        _count: { _all: true },
      }),
      prisma.booking.count({ where: upcomingWhere }),
      prisma.booking.groupBy({
        by: ["status"],
        where: recentWhere,
        _count: { _all: true },
      }),
      prisma.booking.findMany({
        where: upcomingWhere,
        select: {
          branch: { select: { name: true, timezone: true } },
          id: true,
          restaurantReservation: { select: { id: true } },
          serviceNameSnapshot: true,
          startsAt: true,
          status: true,
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 5,
      }),
    ]);
    const today = countStatuses(todayGrouped);
    const recent = countStatuses(recentGrouped);
    return {
      metrics: {
        ownCompletedLast7Days: recent.get("COMPLETED") ?? 0,
        ownNoShowsLast7Days: recent.get("NO_SHOW") ?? 0,
        ownToday:
          (today.get("PENDING") ?? 0) + (today.get("CONFIRMED") ?? 0),
        ownUpcoming,
      },
      quickActions,
      recentBookings: bookings.map(safeBooking),
      role: "STAFF",
      scope,
      selfCalendarHref: "/business/calendar",
      snapshotAt: snapshotAt.toISOString(),
    };
  }

  const restaurant = isRestaurantVertical(organization.vertical);
  const [todayGrouped, upcomingActive, pendingConfirmations, pendingChangeRequests, bookings] =
    await Promise.all([
      prisma.booking.groupBy({
        by: ["status"],
        where: todayWhere,
        _count: { _all: true },
      }),
      prisma.booking.count({ where: upcomingWhere }),
      prisma.booking.count({
        where: {
          AND: [
            scopeWhere,
            { startsAt: { gte: snapshotAt } },
            { status: "PENDING" },
            { createdAt: { lte: snapshotAt } },
          ],
        },
      }),
      countPendingCustomerChanges({
        branchIds,
        organizationId: actor.organizationId,
        snapshotAt,
      }),
      prisma.booking.findMany({
        where: upcomingWhere,
        select: {
          branch: { select: { name: true, timezone: true } },
          id: true,
          restaurantReservation: { select: { id: true } },
          serviceNameSnapshot: true,
          startsAt: true,
          status: true,
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 5,
      }),
    ]);
  const today = countStatuses(todayGrouped);
  const todayActive =
    (today.get("PENDING") ?? 0) + (today.get("CONFIRMED") ?? 0);

  if (scope === "RECEPTIONIST") {
    const restaurantReservationsToday = restaurant
      ? await prisma.booking.count({
          where: { AND: [todayWhere, { restaurantReservation: { isNot: null } }] },
        })
      : null;
    return {
      metrics: {
        pendingChangeRequests,
        pendingConfirmations,
        restaurantReservationsToday,
        todayActive,
        upcomingActive,
      },
      quickActions,
      recentBookings: bookings.map(safeBooking),
      role: "RECEPTIONIST",
      scope,
      snapshotAt: snapshotAt.toISOString(),
      vertical: organization.vertical,
    };
  }

  const notificationWhere = businessNotificationWhere({
    organizationId: actor.organizationId,
    personId: actor.personId,
    restaurant,
    role: actor.role,
  });
  const [
    reviewsAwaitingReply,
    operationalUpdatesLast24Hours,
    activeServices,
    activeRestaurantTables,
    activeMenuItems,
    activeWorkforce,
    readiness,
  ] = await Promise.all([
    prisma.review.count({
      where: {
        businessReply: null,
        organizationId: actor.organizationId,
        status: "VISIBLE",
        booking: {
          organizationId: actor.organizationId,
          restaurantReservation: { is: null },
        },
        service: { organizationId: actor.organizationId },
        createdAt: { lte: snapshotAt },
      },
    }),
    prisma.notification.count({
      where: {
        AND: [
          notificationWhere,
          {
            createdAt: {
              gte: new Date(snapshotAt.getTime() - 24 * 60 * 60 * 1_000),
              lte: snapshotAt,
            },
          },
        ],
      },
    }),
    restaurant
      ? Promise.resolve(null)
      : prisma.service.count({
          where: {
            deletedAt: null,
            organizationId: actor.organizationId,
            status: "ACTIVE",
          },
        }),
    restaurant
      ? prisma.restaurantTable.count({
          where: {
            branch: { deletedAt: null, status: "ACTIVE" },
            businessId: actor.organizationId,
            isActive: true,
          },
        })
      : Promise.resolve(null),
    restaurant
      ? prisma.menuItem.count({
          where: {
            businessId: actor.organizationId,
            isAvailable: true,
            category: { isActive: true },
          },
        })
      : Promise.resolve(null),
    prisma.organizationMember.count({
      where: {
        deletedAt: null,
        organizationId: actor.organizationId,
        person: { deletedAt: null, status: "ACTIVE" },
        role: { systemRole: { in: ["MANAGER", "RECEPTIONIST", "STAFF"] } },
        status: "ACTIVE",
      },
    }),
    getBusinessReadiness(reference),
  ]);
  return {
    metrics: {
      activeBranches: branches.length,
      activeMenuItems,
      activeRestaurantTables,
      activeServices,
      activeWorkforce,
      cancellationsToday: today.get("CANCELLED") ?? 0,
      completedToday: today.get("COMPLETED") ?? 0,
      noShowsToday: today.get("NO_SHOW") ?? 0,
      operationalUpdatesLast24Hours,
      pendingChangeRequests,
      pendingConfirmations,
      reviewsAwaitingReply,
      todayActive,
      upcomingActive,
    },
    organizationName: actor.organizationName,
    quickActions,
    readiness,
    recentBookings: bookings.map(safeBooking),
    role: actor.role as "OWNER" | "MANAGER",
    scope,
    snapshotAt: snapshotAt.toISOString(),
    vertical: organization.vertical,
  };
}
