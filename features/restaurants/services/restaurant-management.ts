import "server-only";

import { notFound } from "next/navigation";

import { canManageOrganization } from "@/features/business/policies/access";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

export async function requireRestaurantBusiness() {
  const identity = await requireBusinessIdentity();
  if (!isRestaurantVertical(identity.membership.organization.vertical)) {
    notFound();
  }
  return identity;
}

export async function getRestaurantTables() {
  const { membership } = await requireRestaurantBusiness();
  const organizationId = membership.organizationId;
  const [tables, branches] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { businessId: organizationId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.branch.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    tables,
    branches,
    canEdit: canManageOrganization(membership.role.systemRole),
  };
}

export async function getRestaurantMenu() {
  const { membership } = await requireRestaurantBusiness();
  const organizationId = membership.organizationId;
  const categories = await prisma.menuCategory.findMany({
    where: { businessId: organizationId },
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return {
    categories,
    canEdit: canManageOrganization(membership.role.systemRole),
  };
}

export async function getRestaurantOverviewStats() {
  const { membership } = await requireRestaurantBusiness();
  const organizationId = membership.organizationId;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const [activeTables, menuItems, menuCategories, upcomingBookings, todayBookings] =
    await Promise.all([
      prisma.restaurantTable.count({
        where: { businessId: organizationId, isActive: true },
      }),
      prisma.menuItem.count({
        where: { businessId: organizationId, isAvailable: true },
      }),
      prisma.menuCategory.count({
        where: { businessId: organizationId, isActive: true },
      }),
      prisma.booking.count({
        where: {
          organizationId,
          startsAt: { gte: now },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
      prisma.booking.count({
        where: {
          organizationId,
          startsAt: { gte: startOfToday, lt: endOfToday },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
    ]);

  return {
    activeTables,
    menuItems,
    menuCategories,
    upcomingBookings,
    todayBookings,
  };
}

export async function getRestaurantReservationsOverview() {
  const { membership } = await requireRestaurantBusiness();
  const bookings = await prisma.booking.findMany({
    where: {
      organizationId: membership.organizationId,
      restaurantReservation: { isNot: null },
    },
    include: {
      branch: true,
      customer: true,
      restaurantReservation: {
        include: {
          table: true,
          items: { include: { menuItem: true } },
        },
      },
    },
    orderBy: { startsAt: "desc" },
    take: 50,
  });

  return { bookings };
}
