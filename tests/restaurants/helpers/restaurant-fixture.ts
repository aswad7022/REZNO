import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { BusinessVertical, EntityStatus } from "@prisma/client";

import { prisma } from "../../../lib/db/prisma";

export async function assertDisposableRestaurantDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_)/,
    "Restaurant tests require a disposable test database.",
  );
}

export async function resetRestaurantTestData() {
  await assertDisposableRestaurantDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

export function futureRestaurantDate(timezone = "UTC", offsetDays = 3) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

export async function createRestaurantFixture(options: {
  branchDeleted?: boolean;
  branchStatus?: EntityStatus;
  businessDeleted?: boolean;
  businessStatus?: EntityStatus;
  date?: string;
  label?: string;
  tableCapacities?: number[];
  timezone?: string;
  vertical?: BusinessVertical;
} = {}) {
  const label = options.label ?? `gate2d-${randomUUID().slice(0, 8)}`;
  const timezone = options.timezone ?? "UTC";
  const date = options.date ?? futureRestaurantDate(timezone);
  const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const organization = await prisma.organization.create({
    data: {
      deletedAt: options.businessDeleted ? new Date() : null,
      isActive: options.businessStatus !== "INACTIVE",
      name: `${label} Restaurant`,
      profile: {
        create: {
          businessCategory: "QA Restaurant",
          description: "Deterministic Gate 2D restaurant fixture.",
        },
      },
      settings: {
        create: { bookingEnabled: true, marketplaceVisible: true },
      },
      slug: `${label}-restaurant`,
      status: options.businessStatus ?? "ACTIVE",
      vertical: options.vertical ?? "RESTAURANT",
    },
  });
  const branch = await prisma.branch.create({
    data: {
      addressLine1: "QA Street",
      businessHours: {
        create: { closeTime: "20:00", dayOfWeek, isOpen: true, openTime: "09:00" },
      },
      city: "QA City",
      deletedAt: options.branchDeleted ? new Date() : null,
      name: `${label} Main Branch`,
      organizationId: organization.id,
      slug: "main",
      status: options.branchStatus ?? "ACTIVE",
      timezone,
    },
  });
  const capacities = options.tableCapacities ?? [2, 4, 4, 6];
  const tables = [];
  for (const [index, capacity] of capacities.entries()) {
    tables.push(await prisma.restaurantTable.create({
      data: {
        area: index % 2 === 0 ? "Indoor" : "Terrace",
        branchId: branch.id,
        businessId: organization.id,
        capacity,
        name: `${label} Table ${index + 1}`,
      },
    }));
  }
  const category = await prisma.menuCategory.create({
    data: {
      businessId: organization.id,
      isActive: true,
      name: `${label} Main Menu`,
      sortOrder: 1,
    },
  });
  const menuItem = await prisma.menuItem.create({
    data: {
      businessId: organization.id,
      currency: "IQD",
      isAvailable: true,
      menuCategoryId: category.id,
      name: `${label} Dish`,
      price: "12000",
      sortOrder: 1,
    },
  });
  const unavailableMenuItem = await prisma.menuItem.create({
    data: {
      businessId: organization.id,
      currency: "IQD",
      isAvailable: false,
      menuCategoryId: category.id,
      name: `${label} Unavailable Dish`,
      price: "9000",
      sortOrder: 2,
    },
  });
  const customer = await prisma.person.create({
    data: {
      authUserId: `restaurant-customer-${randomUUID()}`,
      displayName: "Restaurant QA Customer",
      firstName: "Restaurant QA",
      isOnboarded: true,
      phone: "+9647500000000",
      status: "ACTIVE",
      timezone,
    },
  });
  return {
    branch,
    category,
    customer,
    date,
    menuItem,
    organization,
    tables,
    unavailableMenuItem,
  };
}
