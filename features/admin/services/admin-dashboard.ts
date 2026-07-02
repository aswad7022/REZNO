import "server-only";

import type { BusinessVertical, EntityStatus } from "@prisma/client";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { prisma } from "@/lib/db/prisma";

export async function getAdminOverview() {
  await requireAdminPermission("ADMIN_DASHBOARD_VIEW");
  const [businesses, activeBusinesses, users, bookings, restaurants, recentBusinesses, recentBookings] =
    await Promise.all([
      prisma.organization.count({ where: { deletedAt: null } }),
      prisma.organization.count({
        where: { deletedAt: null, isActive: true, status: "ACTIVE" },
      }),
      prisma.person.count({ where: { deletedAt: null } }),
      prisma.booking.count(),
      prisma.organization.count({
        where: { deletedAt: null, vertical: { in: ["RESTAURANT", "CAFE"] } },
      }),
      prisma.organization.findMany({
        where: { deletedAt: null },
        include: { profile: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.booking.findMany({
        include: { organization: true, customer: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  return {
    businesses,
    activeBusinesses,
    users,
    bookings,
    restaurants,
    recentBusinesses,
    recentBookings,
    databaseConnected: true,
    authConfigured: Boolean(process.env.BETTER_AUTH_SECRET),
    environment: process.env.NODE_ENV ?? "development",
  };
}

export async function getAdminBusinesses(options?: {
  q?: string;
  vertical?: BusinessVertical;
  status?: EntityStatus;
}) {
  await requireAdminPermission("BUSINESSES_VIEW");
  const query = options?.q?.trim();
  return prisma.organization.findMany({
    where: {
      deletedAt: null,
      ...(query
        ? { name: { contains: query, mode: "insensitive" as const } }
        : {}),
      ...(options?.vertical ? { vertical: options.vertical } : {}),
      ...(options?.status ? { status: options.status } : {}),
    },
    include: {
      profile: true,
      organizationMembers: {
        include: { person: true, role: true },
        orderBy: { createdAt: "asc" },
        take: 3,
      },
      _count: {
        select: {
          branches: true,
          services: true,
          bookings: true,
          restaurantTables: true,
          menuItems: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getAdminBusinessDetails(id: string) {
  await requireAdminPermission("BUSINESSES_VIEW");
  return prisma.organization.findUnique({
    where: { id },
    include: {
      profile: true,
      settings: true,
      branches: { orderBy: { createdAt: "desc" }, take: 20 },
      services: { include: { category: true }, orderBy: { createdAt: "desc" } },
      restaurantTables: { orderBy: { createdAt: "desc" } },
      menuCategories: {
        include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      bookings: {
        include: { customer: true, branch: true },
        orderBy: { startsAt: "desc" },
        take: 20,
      },
      reviews: {
        include: { customer: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      organizationMembers: {
        include: { person: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getAdminUsers() {
  await requireAdminPermission("USERS_VIEW");
  return prisma.person.findMany({
    where: { deletedAt: null },
    include: {
      memberships: {
        include: { organization: true, role: true },
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
}

export async function getAdminUserDetails(id: string) {
  await requireAdminPermission("USERS_VIEW");
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      memberships: {
        include: { organization: true, role: true },
        orderBy: { createdAt: "desc" },
      },
      customerBookings: {
        include: { organization: true, branch: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      reviews: {
        include: { organization: true, service: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      notifications: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: {
        select: {
          customerBookings: true,
          reviews: true,
          customerConversations: true,
          notifications: true,
        },
      },
    },
  });

  if (!person) return null;

  const authUser = await prisma.user.findUnique({
    where: { id: person.authUserId },
    select: {
      id: true,
      email: true,
      name: true,
      adminAccess: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  return { ...person, authUser };
}

export async function getAdminBookings() {
  await requireAdminPermission("ADMIN_DASHBOARD_VIEW");
  return prisma.booking.findMany({
    include: {
      organization: true,
      customer: true,
      branch: true,
      member: { include: { person: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 150,
  });
}

export async function getAdminRestaurants() {
  await requireAdminPermission("BUSINESSES_VIEW");
  return prisma.organization.findMany({
    where: { deletedAt: null, vertical: { in: ["RESTAURANT", "CAFE"] } },
    include: {
      profile: true,
      _count: {
        select: {
          branches: true,
          restaurantTables: true,
          menuItems: true,
          bookings: true,
        },
      },
      bookings: { orderBy: { startsAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
}
