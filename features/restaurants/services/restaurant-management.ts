import "server-only";

import { notFound } from "next/navigation";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import {
  listOperationalRestaurantMenu,
  listOperationalRestaurantTables,
} from "@/features/business-operations/services/restaurant-catalog";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
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
  const result = await listOperationalRestaurantTables(
    await currentBusinessOperationReference("RESTAURANT_TABLE_READ"),
  );
  return { ...result, canEdit: result.canWrite };
}

export async function getRestaurantMenu() {
  const result = await listOperationalRestaurantMenu(
    await currentBusinessOperationReference("RESTAURANT_MENU_READ"),
  );
  return { ...result, canEdit: result.canWrite };
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
