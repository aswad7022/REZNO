import "server-only";

import { Prisma, type BookingStatus } from "@prisma/client";

import {
  branchCompletedPeriodRange,
  branchRangeWhere,
  deterministicTopN,
  safeRate,
  type BusinessAnalyticsPeriod,
} from "@/features/business-operations/domain/closure";
import {
  resolveBusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import { prisma } from "@/lib/db/prisma";

const TOP_RESULT_LIMIT = 10;

interface CountedDimension {
  count: number;
  id: string;
  name: string;
}

export interface BusinessOperationalAnalytics {
  branches: CountedDimension[];
  dailyBookings: Array<{ count: number; dayOffset: number }>;
  definitions: {
    period: "completed_branch_local_days";
    rates: "status_count_divided_by_total_bookings";
    revenue: "not_reported";
  };
  metrics: {
    cancellationRate: number;
    completionRate: number;
    genericBookings: number;
    noShowRate: number;
    restaurantGuests: number;
    restaurantReservations: number;
    totalBookings: number;
  };
  periodDays: 7 | 30;
  snapshotAt: string;
  staffWorkload: CountedDimension[];
  statusDistribution: Record<BookingStatus, number>;
  topServices: CountedDimension[];
}

function emptyStatusDistribution(): Record<BookingStatus, number> {
  return {
    CANCELLED: 0,
    COMPLETED: 0,
    CONFIRMED: 0,
    NO_SHOW: 0,
    PENDING: 0,
  };
}

function displayName(person: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return (
    person.displayName ??
    [person.firstName, person.lastName].filter(Boolean).join(" ")
  );
}

export async function getBusinessOperationalAnalytics(
  reference: BusinessOperationActorReference,
  period: BusinessAnalyticsPeriod,
  snapshotAt = new Date(),
): Promise<BusinessOperationalAnalytics> {
  const actor = await resolveBusinessOperationActor(
    reference,
    "BUSINESS_ANALYTICS_READ",
  );
  const periodDays = Number(period) as 7 | 30;
  const branches = await prisma.branch.findMany({
    where: { organizationId: actor.organizationId },
    select: { id: true, name: true, timezone: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const ranges = branches.map((branch) =>
    branchCompletedPeriodRange(branch, snapshotAt, periodDays),
  );
  const periodWhere: Prisma.BookingWhereInput = ranges.length
    ? {
        AND: [
          { organizationId: actor.organizationId },
          { OR: branchRangeWhere(ranges) },
          { createdAt: { lte: snapshotAt } },
        ],
      }
    : { branchId: { in: [] } };

  const [
    statusRows,
    restaurantReservations,
    serviceRows,
    branchRows,
    memberRows,
    restaurantRows,
    dailyRows,
  ] = await Promise.all([
    prisma.booking.groupBy({
      by: ["status"],
      where: periodWhere,
      _count: { _all: true },
    }),
    prisma.booking.count({
      where: { AND: [periodWhere, { restaurantReservation: { isNot: null } }] },
    }),
    prisma.booking.groupBy({
      by: ["serviceNameSnapshot"],
      where: periodWhere,
      _count: { _all: true },
      orderBy: [
        { _count: { serviceNameSnapshot: "desc" } },
        { serviceNameSnapshot: "asc" },
      ],
      take: TOP_RESULT_LIMIT,
    }),
    prisma.booking.groupBy({
      by: ["branchId"],
      where: periodWhere,
      _count: { _all: true },
      orderBy: [{ _count: { branchId: "desc" } }, { branchId: "asc" }],
      take: TOP_RESULT_LIMIT,
    }),
    prisma.booking.groupBy({
      by: ["memberId"],
      where: { AND: [periodWhere, { memberId: { not: null } }] },
      _count: { _all: true },
      orderBy: [{ _count: { memberId: "desc" } }, { memberId: "asc" }],
      take: TOP_RESULT_LIMIT,
    }),
    prisma.restaurantReservationDetails.groupBy({
      by: ["branchId"],
      where: { booking: periodWhere },
      _sum: { guestCount: true },
    }),
    prisma.$queryRaw<Array<{ count: bigint; dayOffset: number }>>(Prisma.sql`
      SELECT
        (timezone(branch."timezone", ${snapshotAt}::timestamptz)::date
          - timezone(branch."timezone", booking."startsAt")::date)::int AS "dayOffset",
        COUNT(*)::bigint AS "count"
      FROM "Booking" AS booking
      INNER JOIN "Branch" AS branch ON branch."id" = booking."branchId"
      WHERE booking."organizationId" = ${actor.organizationId}::uuid
        AND booking."createdAt" <= ${snapshotAt}::timestamptz
        AND timezone(branch."timezone", booking."startsAt")::date
          >= timezone(branch."timezone", ${snapshotAt}::timestamptz)::date - ${periodDays}::int
        AND timezone(branch."timezone", booking."startsAt")::date
          < timezone(branch."timezone", ${snapshotAt}::timestamptz)::date
      GROUP BY "dayOffset"
      ORDER BY "dayOffset" DESC
    `),
  ]);

  const statusDistribution = emptyStatusDistribution();
  for (const row of statusRows) {
    statusDistribution[row.status] = row._count._all;
  }
  const totalBookings = Object.values(statusDistribution).reduce(
    (sum, count) => sum + count,
    0,
  );
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const memberIds = memberRows.flatMap((row) => (row.memberId ? [row.memberId] : []));
  const members = memberIds.length
    ? await prisma.organizationMember.findMany({
        where: {
          id: { in: memberIds },
          organizationId: actor.organizationId,
        },
        select: {
          id: true,
          person: {
            select: { displayName: true, firstName: true, lastName: true },
          },
        },
      })
    : [];
  const memberNameById = new Map(
    members.map((member) => [member.id, displayName(member.person)]),
  );
  const dailyByOffset = new Map(
    dailyRows.map((row) => [Number(row.dayOffset), Number(row.count)]),
  );
  const restaurantGuests = restaurantRows.reduce(
    (sum, row) => sum + (row._sum.guestCount ?? 0),
    0,
  );

  return {
    branches: deterministicTopN(
      branchRows.map((row) => ({
        count: row._count._all,
        id: row.branchId,
        name: branchNameById.get(row.branchId) ?? "Historical Branch",
      })),
      TOP_RESULT_LIMIT,
    ),
    dailyBookings: Array.from({ length: periodDays }, (_, index) => {
      const dayOffset = periodDays - index;
      return { count: dailyByOffset.get(dayOffset) ?? 0, dayOffset };
    }),
    definitions: {
      period: "completed_branch_local_days",
      rates: "status_count_divided_by_total_bookings",
      revenue: "not_reported",
    },
    metrics: {
      cancellationRate: safeRate(statusDistribution.CANCELLED, totalBookings),
      completionRate: safeRate(statusDistribution.COMPLETED, totalBookings),
      genericBookings: totalBookings - restaurantReservations,
      noShowRate: safeRate(statusDistribution.NO_SHOW, totalBookings),
      restaurantGuests,
      restaurantReservations,
      totalBookings,
    },
    periodDays,
    snapshotAt: snapshotAt.toISOString(),
    staffWorkload: deterministicTopN(
      memberRows.flatMap((row) =>
        row.memberId
          ? [
              {
                count: row._count._all,
                id: row.memberId,
                name: memberNameById.get(row.memberId) ?? "Historical Staff",
              },
            ]
          : [],
      ),
      TOP_RESULT_LIMIT,
    ),
    statusDistribution,
    topServices: deterministicTopN(
      serviceRows.map((row) => ({
        count: row._count._all,
        id: row.serviceNameSnapshot,
        name: row.serviceNameSnapshot,
      })),
      TOP_RESULT_LIMIT,
    ),
  };
}

export const businessAnalyticsInternals = {
  TOP_RESULT_LIMIT,
  emptyStatusDistribution,
};
