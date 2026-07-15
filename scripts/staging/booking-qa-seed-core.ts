import type { Prisma, PrismaClient } from "@prisma/client";

export const BOOKING_QA_FIXTURE = {
  namespace: "rezno-qa-booking-gate2a",
  category: {
    id: "7a000000-0000-4000-8000-000000000001",
    slug: "rezno-qa-booking-services",
  },
  organization: {
    id: "7a000000-0000-4000-8000-000000000002",
    slug: "rezno-qa-booking-gate2a",
  },
  branch: { id: "7a000000-0000-4000-8000-000000000003", slug: "qa-main" },
  service: { id: "7a000000-0000-4000-8000-000000000004" },
  offering: { id: "7a000000-0000-4000-8000-000000000005" },
  staffPerson: {
    id: "7a000000-0000-4000-8000-000000000006",
    authUserId: "fixture:rezno-qa-booking-gate2a:staff",
  },
  role: { id: "7a000000-0000-4000-8000-000000000007" },
  member: { id: "7a000000-0000-4000-8000-000000000008" },
} as const;

export class BookingQaSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingQaSeedInvariantError";
  }
}

export async function seedBookingQaFixture(database: PrismaClient) {
  const runTransaction = async (transaction: Prisma.TransactionClient) => {
    await assertFixtureIdentity(transaction);
    const category = await transaction.category.upsert({
      where: { slug: BOOKING_QA_FIXTURE.category.slug },
      create: {
        id: BOOKING_QA_FIXTURE.category.id,
        name: "REZNO QA Booking Services",
        slug: BOOKING_QA_FIXTURE.category.slug,
      },
      update: { name: "REZNO QA Booking Services" },
    });
    const organization = await transaction.organization.upsert({
      where: { slug: BOOKING_QA_FIXTURE.organization.slug },
      create: {
        id: BOOKING_QA_FIXTURE.organization.id,
        isActive: true,
        name: "REZNO QA Booking Gate 2A",
        slug: BOOKING_QA_FIXTURE.organization.slug,
        status: "ACTIVE",
        vertical: "BEAUTY",
      },
      update: {
        isActive: true,
        name: "REZNO QA Booking Gate 2A",
        status: "ACTIVE",
        vertical: "BEAUTY",
      },
    });
    await transaction.organizationSettings.upsert({
      where: { organizationId: organization.id },
      create: {
        bookingEnabled: true,
        marketplaceVisible: true,
        organizationId: organization.id,
      },
      update: { bookingEnabled: true, marketplaceVisible: true },
    });
    await transaction.businessProfile.upsert({
      where: { organizationId: organization.id },
      create: {
        businessCategory: "QA Services",
        description: "Staging-only deterministic fixture for generic service booking QA.",
        organizationId: organization.id,
      },
      update: {
        businessCategory: "QA Services",
        description: "Staging-only deterministic fixture for generic service booking QA.",
      },
    });
    const branch = await transaction.branch.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: BOOKING_QA_FIXTURE.branch.slug,
        },
      },
      create: {
        city: "Baghdad QA",
        id: BOOKING_QA_FIXTURE.branch.id,
        name: "QA Main Branch",
        organizationId: organization.id,
        slug: BOOKING_QA_FIXTURE.branch.slug,
        status: "ACTIVE",
        timezone: "Asia/Baghdad",
      },
      update: {
        city: "Baghdad QA",
        name: "QA Main Branch",
        status: "ACTIVE",
        timezone: "Asia/Baghdad",
      },
    });
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      await transaction.businessHour.upsert({
        where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
        create: {
          branchId: branch.id,
          closeTime: "20:00",
          dayOfWeek,
          isOpen: true,
          openTime: "09:00",
        },
        update: { closeTime: "20:00", isOpen: true, openTime: "09:00" },
      });
    }
    const service = await transaction.service.upsert({
      where: { id: BOOKING_QA_FIXTURE.service.id },
      create: {
        categoryId: category.id,
        description: "Generic service fixture; not a restaurant reservation.",
        id: BOOKING_QA_FIXTURE.service.id,
        name: "Gate 2A QA Service",
        organizationId: organization.id,
        staffSelectionMode: "REQUIRED",
        status: "ACTIVE",
      },
      update: {
        categoryId: category.id,
        description: "Generic service fixture; not a restaurant reservation.",
        name: "Gate 2A QA Service",
        organizationId: organization.id,
        staffSelectionMode: "REQUIRED",
        status: "ACTIVE",
      },
    });
    const offering = await transaction.branchService.upsert({
      where: { branchId_serviceId: { branchId: branch.id, serviceId: service.id } },
      create: {
        branchId: branch.id,
        durationMinutes: 30,
        id: BOOKING_QA_FIXTURE.offering.id,
        isAvailable: true,
        price: "25000",
        serviceId: service.id,
      },
      update: { durationMinutes: 30, isAvailable: true, price: "25000" },
    });
    const staffPerson = await transaction.person.upsert({
      where: { authUserId: BOOKING_QA_FIXTURE.staffPerson.authUserId },
      create: {
        authUserId: BOOKING_QA_FIXTURE.staffPerson.authUserId,
        displayName: "QA Professional",
        firstName: "QA",
        id: BOOKING_QA_FIXTURE.staffPerson.id,
        isOnboarded: true,
        phone: "+9647500000099",
        status: "ACTIVE",
      },
      update: {
        displayName: "QA Professional",
        firstName: "QA",
        isOnboarded: true,
        status: "ACTIVE",
      },
    });
    const role = await transaction.role.upsert({
      where: {
        organizationId_name: { organizationId: organization.id, name: "QA Staff" },
      },
      create: {
        id: BOOKING_QA_FIXTURE.role.id,
        isSystem: true,
        name: "QA Staff",
        organizationId: organization.id,
        systemRole: "STAFF",
      },
      update: { isSystem: true, systemRole: "STAFF" },
    });
    const member = await transaction.organizationMember.upsert({
      where: {
        personId_organizationId: {
          organizationId: organization.id,
          personId: staffPerson.id,
        },
      },
      create: {
        id: BOOKING_QA_FIXTURE.member.id,
        organizationId: organization.id,
        personId: staffPerson.id,
        roleId: role.id,
        status: "ACTIVE",
      },
      update: { deletedAt: null, roleId: role.id, status: "ACTIVE" },
    });
    await transaction.branchAssignment.upsert({
      where: { memberId_branchId: { branchId: branch.id, memberId: member.id } },
      create: { branchId: branch.id, memberId: member.id },
      update: {},
    });
    await transaction.serviceStaffAssignment.upsert({
      where: { serviceId_memberId: { memberId: member.id, serviceId: service.id } },
      create: { memberId: member.id, serviceId: service.id },
      update: {},
    });
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      await transaction.availability.upsert({
        where: {
          memberId_branchId_dayOfWeek_startTime_endTime: {
            branchId: branch.id,
            dayOfWeek,
            endTime: "20:00",
            memberId: member.id,
            startTime: "09:00",
          },
        },
        create: {
          branchId: branch.id,
          dayOfWeek,
          endTime: "20:00",
          isActive: true,
          memberId: member.id,
          startTime: "09:00",
        },
        update: { isActive: true },
      });
    }

    return {
      branchServiceId: offering.id,
      businessSlug: organization.slug,
      memberId: member.id,
      serviceId: service.id,
    };
  };

  return database.$transaction(runTransaction, {
    maxWait: 10_000,
    timeout: 30_000,
  });
}

async function assertFixtureIdentity(transaction: Prisma.TransactionClient) {
  const organization = await transaction.organization.findUnique({
    where: { slug: BOOKING_QA_FIXTURE.organization.slug },
    select: { id: true },
  });
  const category = await transaction.category.findUnique({
    where: { slug: BOOKING_QA_FIXTURE.category.slug },
    select: { id: true },
  });
  if (organization && organization.id !== BOOKING_QA_FIXTURE.organization.id) {
    throw new BookingQaSeedInvariantError(
      "The namespaced Booking QA organization slug is owned by another record.",
    );
  }
  if (category && category.id !== BOOKING_QA_FIXTURE.category.id) {
    throw new BookingQaSeedInvariantError(
      "The namespaced Booking QA category slug is owned by another record.",
    );
  }
}
