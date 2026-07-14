import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type {
  BusinessVertical,
  EntityStatus,
  StaffSelectionMode,
} from "@prisma/client";

import { prisma } from "../../../lib/db/prisma";

export async function assertDisposableBookingDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_)/,
    "Booking tests require a disposable test database.",
  );
}

export async function resetBookingTestData() {
  await assertDisposableBookingDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

export function futureLocalDate(timezone = "UTC", offsetDays = 3) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

export async function createBookingFixture(options: {
  branchStatus?: EntityStatus;
  businessStatus?: EntityStatus;
  date?: string;
  label?: string;
  mode?: StaffSelectionMode;
  serviceStatus?: "ACTIVE" | "INACTIVE";
  timezone?: string;
  vertical?: BusinessVertical;
} = {}) {
  const label = options.label ?? `gate2a-${randomUUID().slice(0, 8)}`;
  const mode = options.mode ?? "REQUIRED";
  const timezone = options.timezone ?? "UTC";
  const date = options.date ?? futureLocalDate(timezone);
  const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const category = await prisma.category.create({
    data: { name: `${label} Category`, slug: `${label}-category` },
  });
  const roleId = randomUUID();
  const organization = await prisma.organization.create({
    data: {
      isActive: options.businessStatus !== "INACTIVE",
      name: `${label} Business`,
      profile: {
        create: {
          businessCategory: "QA Services",
          description: "Deterministic Gate 2A booking test fixture.",
        },
      },
      roles: {
        create: {
          id: roleId,
          isSystem: true,
          name: "Staff",
          systemRole: "STAFF",
        },
      },
      settings: {
        create: { bookingEnabled: true, marketplaceVisible: true },
      },
      slug: `${label}-business`,
      status: options.businessStatus ?? "ACTIVE",
      vertical: options.vertical ?? "BEAUTY",
    },
  });
  const branch = await prisma.branch.create({
    data: {
      businessHours: {
        create: {
          closeTime: "17:00",
          dayOfWeek,
          isOpen: true,
          openTime: "09:00",
        },
      },
      city: "QA City",
      name: `${label} Main Branch`,
      organizationId: organization.id,
      slug: "main",
      status: options.branchStatus ?? "ACTIVE",
      timezone,
    },
  });
  const service = await prisma.service.create({
    data: {
      categoryId: category.id,
      description: "Gate 2A service",
      name: `${label} Service`,
      organizationId: organization.id,
      staffSelectionMode: mode,
      status: options.serviceStatus ?? "ACTIVE",
    },
  });
  const offering = await prisma.branchService.create({
    data: {
      branchId: branch.id,
      durationMinutes: 30,
      isAvailable: true,
      price: "25000",
      serviceId: service.id,
    },
  });
  const customer = await prisma.person.create({
    data: {
      authUserId: `auth-customer-${randomUUID()}`,
      firstName: "Booking Customer",
      isOnboarded: true,
      phone: "+9647500000000",
      timezone,
    },
  });

  let member: Awaited<ReturnType<typeof prisma.organizationMember.create>> | null = null;
  if (mode !== "NONE") {
    const staffPerson = await prisma.person.create({
      data: {
        authUserId: `auth-staff-${randomUUID()}`,
        firstName: "QA Professional",
        isOnboarded: true,
        phone: "+9647500000001",
        timezone,
      },
    });
    member = await prisma.organizationMember.create({
      data: {
        assignments: { create: { branchId: branch.id } },
        availabilities: {
          create: {
            branchId: branch.id,
            dayOfWeek,
            endTime: "17:00",
            isActive: true,
            startTime: "09:00",
          },
        },
        organizationId: organization.id,
        personId: staffPerson.id,
        roleId,
        serviceAssignments: { create: { serviceId: service.id } },
      },
    });
  }

  return {
    branch,
    category,
    customer,
    date,
    member,
    offering,
    organization,
    service,
  };
}
