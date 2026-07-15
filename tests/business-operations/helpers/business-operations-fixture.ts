import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { SystemRole } from "@prisma/client";

import type { BusinessOperationActorReference } from "../../../features/business-operations/services/context";
import { prisma } from "../../../lib/db/prisma";

export async function assertDisposableBusinessOperationsDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_)/,
    "Business Operations tests require a disposable test database.",
  );
}

export async function resetBusinessOperationsTestData() {
  await assertDisposableBusinessOperationsDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

export function futureDate(offsetDays = 4) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function localBlockInput(date: string, start = "11:00", end = "13:00") {
  return { endsAt: `${date}T${end}`, reason: "Private operational reason", startsAt: `${date}T${start}` };
}

async function createPerson(label: string) {
  return prisma.person.create({
    data: {
      authUserId: `stage2a-${label}-${randomUUID()}`,
      firstName: label,
      isOnboarded: true,
      phone: `+964750${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`,
      timezone: "UTC",
    },
  });
}

async function createMembership(
  organizationId: string,
  roleId: string,
  person: Awaited<ReturnType<typeof createPerson>>,
) {
  const membership = await prisma.organizationMember.create({
    data: { organizationId, personId: person.id, roleId },
  });
  return {
    membership,
    person,
    reference: {
      contextOrganizationId: organizationId,
      membershipId: membership.id,
      personId: person.id,
    } satisfies BusinessOperationActorReference,
  };
}

async function createRoles(organizationId: string) {
  const entries = await Promise.all(
    (["OWNER", "MANAGER", "RECEPTIONIST", "STAFF"] as const).map((systemRole) =>
      prisma.role.create({
        data: {
          isSystem: true,
          name: systemRole,
          organizationId,
          systemRole,
        },
      }),
    ),
  );
  return Object.fromEntries(entries.map((role) => [role.systemRole!, role])) as Record<SystemRole, (typeof entries)[number]>;
}

export async function createBusinessOperationsFixture(label = randomUUID().slice(0, 8)) {
  const category = await prisma.category.create({
    data: { name: `${label} Category`, slug: `${label}-business-operations-category` },
  });
  const organizationA = await prisma.organization.create({
    data: {
      isActive: true,
      name: `${label} Organization A`,
      profile: { create: { businessCategory: "Restaurant", description: "Business Operations QA" } },
      settings: { create: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true } },
      slug: `${label}-organization-a`,
      status: "ACTIVE",
      vertical: "RESTAURANT",
    },
  });
  const rolesA = await createRoles(organizationA.id);
  const ownerPerson = await createPerson(`${label}-owner`);
  const owner = await createMembership(organizationA.id, rolesA.OWNER.id, ownerPerson);
  const manager = await createMembership(organizationA.id, rolesA.MANAGER.id, await createPerson(`${label}-manager`));
  const receptionist = await createMembership(organizationA.id, rolesA.RECEPTIONIST.id, await createPerson(`${label}-receptionist`));
  const staff = await createMembership(organizationA.id, rolesA.STAFF.id, await createPerson(`${label}-staff`));
  const revoked = await createMembership(organizationA.id, rolesA.MANAGER.id, await createPerson(`${label}-revoked`));
  await prisma.organizationMember.update({ where: { id: revoked.membership.id }, data: { status: "INACTIVE" } });

  const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closeTime: "20:00",
    dayOfWeek,
    isOpen: true,
    openTime: "09:00",
  }));
  const activeBranch = await prisma.branch.create({
    data: {
      businessHours: { create: hours },
      city: "Baghdad",
      country: "Iraq",
      name: `${label} Active Branch`,
      organizationId: organizationA.id,
      slug: "active",
      status: "ACTIVE",
      timezone: "UTC",
    },
  });
  const inactiveBranch = await prisma.branch.create({
    data: {
      businessHours: { create: hours },
      name: `${label} Inactive Branch`,
      organizationId: organizationA.id,
      slug: "inactive",
      status: "INACTIVE",
      timezone: "UTC",
    },
  });
  const service = await prisma.service.create({
    data: {
      categoryId: category.id,
      name: `${label} Service`,
      organizationId: organizationA.id,
      staffSelectionMode: "NONE",
      status: "ACTIVE",
    },
  });
  const offering = await prisma.branchService.create({
    data: {
      branchId: activeBranch.id,
      durationMinutes: 30,
      isAvailable: true,
      price: "25000",
      serviceId: service.id,
    },
  });
  const table = await prisma.restaurantTable.create({
    data: {
      branchId: activeBranch.id,
      businessId: organizationA.id,
      capacity: 4,
      isActive: true,
      name: "QA Table",
    },
  });
  const customer = await createPerson(`${label}-customer`);

  const organizationB = await prisma.organization.create({
    data: {
      isActive: true,
      name: `${label} Organization B`,
      settings: { create: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true } },
      slug: `${label}-organization-b`,
      status: "ACTIVE",
      vertical: "BEAUTY",
    },
  });
  const rolesB = await createRoles(organizationB.id);
  const ownerB = await createMembership(organizationB.id, rolesB.OWNER.id, ownerPerson);
  const branchB = await prisma.branch.create({
    data: {
      businessHours: { create: hours },
      name: `${label} Organization B Branch`,
      organizationId: organizationB.id,
      slug: "other",
      status: "ACTIVE",
      timezone: "UTC",
    },
  });

  return {
    activeBranch,
    branchB,
    category,
    customer,
    inactiveBranch,
    manager,
    offering,
    organizationA,
    organizationB,
    owner,
    ownerB,
    receptionist,
    revoked,
    service,
    staff,
    table,
  };
}

export async function createFutureGenericBooking(
  fixture: Awaited<ReturnType<typeof createBusinessOperationsFixture>>,
  date = futureDate(),
) {
  return prisma.booking.create({
    data: {
      branchId: fixture.activeBranch.id,
      branchServiceId: fixture.offering.id,
      customerId: fixture.customer.id,
      customerNameSnapshot: "QA Customer",
      endsAt: new Date(`${date}T12:30:00.000Z`),
      organizationId: fixture.organizationA.id,
      priceSnapshot: "25000",
      serviceNameSnapshot: "QA Service",
      startsAt: new Date(`${date}T12:00:00.000Z`),
      status: "CONFIRMED",
    },
  });
}

export async function createFutureRestaurantBooking(
  fixture: Awaited<ReturnType<typeof createBusinessOperationsFixture>>,
  date = futureDate(),
) {
  return prisma.booking.create({
    data: {
      branchId: fixture.activeBranch.id,
      customerId: fixture.customer.id,
      customerNameSnapshot: "Restaurant Customer",
      endsAt: new Date(`${date}T15:30:00.000Z`),
      organizationId: fixture.organizationA.id,
      priceSnapshot: "0",
      restaurantReservation: {
        create: {
          branchId: fixture.activeBranch.id,
          businessId: fixture.organizationA.id,
          durationMinutes: 90,
          guestCount: 2,
          reservationDateTime: new Date(`${date}T14:00:00.000Z`),
          tableId: fixture.table.id,
        },
      },
      serviceNameSnapshot: "Restaurant reservation",
      startsAt: new Date(`${date}T14:00:00.000Z`),
      status: "CONFIRMED",
    },
    include: { restaurantReservation: true },
  });
}

export function branchInput(branch: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  latitude: { toNumber(): number } | null;
  locationInstructions: string | null;
  locationLabel: string | null;
  longitude: { toNumber(): number } | null;
  name: string;
  nearbyLandmark: string | null;
  phone: string | null;
  timezone: string;
}) {
  return {
    addressLine1: branch.addressLine1,
    addressLine2: branch.addressLine2,
    city: branch.city,
    country: branch.country,
    email: branch.email,
    latitude: branch.latitude?.toNumber() ?? null,
    locationInstructions: branch.locationInstructions,
    locationLabel: branch.locationLabel,
    longitude: branch.longitude?.toNumber() ?? null,
    name: branch.name,
    nearbyLandmark: branch.nearbyLandmark,
    phone: branch.phone,
    timezone: branch.timezone,
  };
}
