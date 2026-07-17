import "server-only";

import type { BookingStatus } from "@prisma/client";

import { requireCustomerIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

export interface CustomerDashboardSummary {
  historyCount: number;
  recentBookings: Array<{
    branchName: string;
    id: string;
    serviceName: string;
    startsAt: Date;
    status: BookingStatus;
    timezone: string;
  }>;
  upcomingCount: number;
}

export async function getCustomerDashboardSummary(): Promise<CustomerDashboardSummary> {
  const now = new Date();
  const { person } = await requireCustomerIdentity();
  const [upcomingCount, historyCount, bookings] = await Promise.all([
    prisma.booking.count({
      where: {
        customerId: person.id,
        startsAt: { gte: now },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
    prisma.booking.count({
      where: {
        customerId: person.id,
        OR: [
          { startsAt: { lt: now } },
          { status: { notIn: ["PENDING", "CONFIRMED"] } },
        ],
      },
    }),
    prisma.booking.findMany({
      where: {
        customerId: person.id,
        startsAt: { gte: now },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: {
        branch: { select: { name: true, timezone: true } },
        id: true,
        serviceNameSnapshot: true,
        startsAt: true,
        status: true,
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 3,
    }),
  ]);
  return {
    historyCount,
    recentBookings: bookings.map((booking) => ({
      branchName: booking.branch.name,
      id: booking.id,
      serviceName: booking.serviceNameSnapshot,
      startsAt: booking.startsAt,
      status: booking.status,
      timezone: booking.branch.timezone,
    })),
    upcomingCount,
  };
}
