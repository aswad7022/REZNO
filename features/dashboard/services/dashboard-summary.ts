import "server-only";

import type { BookingStatus, BusinessVertical } from "@prisma/client";

import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { prisma } from "@/lib/db/prisma";
import type { DashboardRole } from "@/types/dashboard";

export interface DashboardSummary {
  primaryCount: number;
  secondaryCount: number;
  commandCenter?: {
    todayBookings: number;
    upcomingBookings: number;
    pendingReviews: number;
    unreadNotifications: number;
  };
  publicSlug?: string;
  vertical?: BusinessVertical;
  recentBookings: Array<{
    id: string;
    serviceName: string;
    branchName: string;
    startsAt: Date;
    timezone: string;
    status: BookingStatus;
  }>;
}

export async function getDashboardSummary(
  role: DashboardRole,
): Promise<DashboardSummary> {
  const now = new Date();

  if (role === "customer") {
    const { person } = await requireCustomerIdentity();
    const [upcoming, history, bookings] = await Promise.all([
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
        include: { branch: true },
        orderBy: { startsAt: "asc" },
        take: 3,
      }),
    ]);
    return {
      primaryCount: upcoming,
      secondaryCount: history,
      recentBookings: bookings.map((booking) => ({
        id: booking.id,
        serviceName: booking.serviceNameSnapshot,
        branchName: booking.branch.name,
        startsAt: booking.startsAt,
        timezone: booking.branch.timezone,
        status: booking.status,
      })),
    };
  }

  const { membership } = await requireBusinessIdentity();
  const organizationId = membership.organizationId;
  const vertical = membership.organization.vertical;
  const restaurantExperience = isRestaurantVertical(vertical);
  const employeeScope =
    membership.role.systemRole === "STAFF"
      ? { memberId: membership.id }
      : {};
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const businessBookingWhere = {
    organizationId,
    ...employeeScope,
  };
  const [
    upcoming,
    secondaryCount,
    bookings,
    todayBookings,
    pendingReviews,
    notifications,
  ] =
    await Promise.all([
    prisma.booking.count({
      where: {
        ...businessBookingWhere,
        startsAt: { gte: now },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
    restaurantExperience
      ? prisma.menuItem.count({
          where: { businessId: organizationId, isAvailable: true },
        })
      : prisma.service.count({
          where: {
            organizationId,
            status: "ACTIVE",
            ...(membership.role.systemRole === "STAFF"
              ? { staffAssignments: { some: { memberId: membership.id } } }
              : {}),
          },
        }),
    prisma.booking.findMany({
      where: {
        ...businessBookingWhere,
        startsAt: { gte: now },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: { branch: true },
      orderBy: { startsAt: "asc" },
      take: 3,
    }),
    prisma.booking.count({
      where: {
        ...businessBookingWhere,
        startsAt: { gte: startOfToday, lt: endOfToday },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
    prisma.booking.count({
      where: {
        ...businessBookingWhere,
        status: "COMPLETED",
        review: null,
      },
    }),
    prisma.bookingStatusHistory.count({
      where: {
        booking: businessBookingWhere,
        createdAt: { gte: startOfToday },
      },
    }),
  ]);
  return {
    primaryCount: upcoming,
    secondaryCount,
    publicSlug: membership.organization.slug,
    vertical,
    commandCenter: {
      todayBookings,
      upcomingBookings: upcoming,
      pendingReviews,
      unreadNotifications: notifications,
    },
    recentBookings: bookings.map((booking) => ({
      id: booking.id,
      serviceName: booking.serviceNameSnapshot,
      branchName: booking.branch.name,
      startsAt: booking.startsAt,
      timezone: booking.branch.timezone,
      status: booking.status,
    })),
  };
}
