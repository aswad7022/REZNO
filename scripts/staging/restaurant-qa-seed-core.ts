import type { Prisma, PrismaClient } from "@prisma/client";

export const RESTAURANT_QA_FIXTURE = {
  namespace: "rezno-qa-restaurant-gate2d",
  organization: { id: "8d000000-0000-4000-8000-000000000001", slug: "rezno-qa-restaurant-gate2d" },
  branch: { id: "8d000000-0000-4000-8000-000000000002", slug: "qa-main" },
  tables: [
    { id: "8d000000-0000-4000-8000-000000000003", name: "QA Indoor 2", capacity: 2, area: "Indoor" },
    { id: "8d000000-0000-4000-8000-000000000004", name: "QA Terrace 2", capacity: 2, area: "Terrace" },
    { id: "8d000000-0000-4000-8000-000000000005", name: "QA Indoor 4", capacity: 4, area: "Indoor" },
    { id: "8d000000-0000-4000-8000-000000000006", name: "QA Terrace 6", capacity: 6, area: "Terrace" },
  ],
  menuCategory: { id: "8d000000-0000-4000-8000-000000000007" },
  menuItems: {
    rice: { id: "8d000000-0000-4000-8000-000000000008" },
    tea: { id: "8d000000-0000-4000-8000-000000000009" },
    unavailable: { id: "8d000000-0000-4000-8000-000000000010" },
  },
  ownerPerson: {
    id: "8d000000-0000-4000-8000-000000000011",
    authUserId: "fixture:rezno-qa-restaurant-gate2d:owner",
  },
  ownerRole: { id: "8d000000-0000-4000-8000-000000000012" },
  ownerMember: { id: "8d000000-0000-4000-8000-000000000013" },
  customer: {
    id: "8d000000-0000-4000-8000-000000000014",
    authUserId: "fixture:rezno-qa-restaurant-gate2d:customer",
  },
} as const;

export class RestaurantQaSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantQaSeedInvariantError";
  }
}

export async function seedRestaurantQaFixture(database: PrismaClient) {
  const operation = async (transaction: Prisma.TransactionClient) => {
    await assertFixtureIdentity(transaction);
    const organization = await transaction.organization.upsert({
      where: { slug: RESTAURANT_QA_FIXTURE.organization.slug },
      create: {
        id: RESTAURANT_QA_FIXTURE.organization.id,
        isActive: true,
        name: "REZNO QA Restaurant Gate 2D",
        slug: RESTAURANT_QA_FIXTURE.organization.slug,
        status: "ACTIVE",
        vertical: "RESTAURANT",
      },
      update: {
        deletedAt: null,
        isActive: true,
        name: "REZNO QA Restaurant Gate 2D",
        status: "ACTIVE",
        vertical: "RESTAURANT",
      },
    });
    await transaction.organizationSettings.upsert({
      where: { organizationId: organization.id },
      create: { bookingEnabled: true, marketplaceVisible: true, organizationId: organization.id },
      update: { bookingEnabled: true, marketplaceVisible: true },
    });
    await transaction.businessProfile.upsert({
      where: { organizationId: organization.id },
      create: {
        businessCategory: "QA Restaurant",
        description: "Staging-only deterministic fixture for restaurant reservation QA.",
        organizationId: organization.id,
      },
      update: {
        businessCategory: "QA Restaurant",
        description: "Staging-only deterministic fixture for restaurant reservation QA.",
      },
    });
    const branch = await transaction.branch.upsert({
      where: { organizationId_slug: { organizationId: organization.id, slug: RESTAURANT_QA_FIXTURE.branch.slug } },
      create: {
        addressLine1: "Gate 2D QA Street",
        city: "Baghdad QA",
        id: RESTAURANT_QA_FIXTURE.branch.id,
        name: "Restaurant QA Main Branch",
        organizationId: organization.id,
        slug: RESTAURANT_QA_FIXTURE.branch.slug,
        status: "ACTIVE",
        timezone: "Asia/Baghdad",
      },
      update: {
        addressLine1: "Gate 2D QA Street",
        city: "Baghdad QA",
        deletedAt: null,
        name: "Restaurant QA Main Branch",
        status: "ACTIVE",
        timezone: "Asia/Baghdad",
      },
    });
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      await transaction.businessHour.upsert({
        where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
        create: { branchId: branch.id, closeTime: "22:00", dayOfWeek, isOpen: true, openTime: "09:00" },
        update: { closeTime: "22:00", isOpen: true, openTime: "09:00" },
      });
    }
    for (const [index, table] of RESTAURANT_QA_FIXTURE.tables.entries()) {
      await transaction.restaurantTable.upsert({
        where: { id: table.id },
        create: {
          ...table,
          branchId: branch.id,
          businessId: organization.id,
          code: `QA-${index + 1}`,
          isActive: true,
        },
        update: {
          area: table.area,
          branchId: branch.id,
          businessId: organization.id,
          capacity: table.capacity,
          code: `QA-${index + 1}`,
          isActive: true,
          name: table.name,
        },
      });
    }
    const category = await transaction.menuCategory.upsert({
      where: { id: RESTAURANT_QA_FIXTURE.menuCategory.id },
      create: {
        businessId: organization.id,
        id: RESTAURANT_QA_FIXTURE.menuCategory.id,
        isActive: true,
        name: "Gate 2D QA Menu",
        sortOrder: 1,
      },
      update: { businessId: organization.id, isActive: true, name: "Gate 2D QA Menu", sortOrder: 1 },
    });
    const items = [
      { ...RESTAURANT_QA_FIXTURE.menuItems.rice, name: "QA Iraqi Rice", price: "12000", isAvailable: true, sortOrder: 1 },
      { ...RESTAURANT_QA_FIXTURE.menuItems.tea, name: "QA Tea", price: "3000", isAvailable: true, sortOrder: 2 },
      { ...RESTAURANT_QA_FIXTURE.menuItems.unavailable, name: "QA Unavailable Dish", price: "9000", isAvailable: false, sortOrder: 3 },
    ];
    for (const item of items) {
      await transaction.menuItem.upsert({
        where: { id: item.id },
        create: {
          businessId: organization.id,
          currency: "IQD",
          id: item.id,
          isAvailable: item.isAvailable,
          menuCategoryId: category.id,
          name: item.name,
          price: item.price,
          sortOrder: item.sortOrder,
        },
        update: {
          businessId: organization.id,
          currency: "IQD",
          isAvailable: item.isAvailable,
          menuCategoryId: category.id,
          name: item.name,
          price: item.price,
          sortOrder: item.sortOrder,
        },
      });
    }
    const owner = await transaction.person.upsert({
      where: { authUserId: RESTAURANT_QA_FIXTURE.ownerPerson.authUserId },
      create: {
        authUserId: RESTAURANT_QA_FIXTURE.ownerPerson.authUserId,
        displayName: "Gate 2D QA Owner",
        firstName: "Gate 2D QA Owner",
        id: RESTAURANT_QA_FIXTURE.ownerPerson.id,
        isOnboarded: true,
        phone: "+9647500000081",
        status: "ACTIVE",
      },
      update: { deletedAt: null, displayName: "Gate 2D QA Owner", isOnboarded: true, phone: "+9647500000081", status: "ACTIVE" },
    });
    const ownerRole = await transaction.role.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "QA Owner" } },
      create: {
        id: RESTAURANT_QA_FIXTURE.ownerRole.id,
        isSystem: true,
        name: "QA Owner",
        organizationId: organization.id,
        systemRole: "OWNER",
      },
      update: { isSystem: true, systemRole: "OWNER" },
    });
    const ownerMember = await transaction.organizationMember.upsert({
      where: { personId_organizationId: { personId: owner.id, organizationId: organization.id } },
      create: {
        id: RESTAURANT_QA_FIXTURE.ownerMember.id,
        organizationId: organization.id,
        personId: owner.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
      },
      update: { deletedAt: null, roleId: ownerRole.id, status: "ACTIVE" },
    });
    await transaction.branchAssignment.upsert({
      where: { memberId_branchId: { memberId: ownerMember.id, branchId: branch.id } },
      create: { memberId: ownerMember.id, branchId: branch.id },
      update: {},
    });
    await transaction.person.upsert({
      where: { authUserId: RESTAURANT_QA_FIXTURE.customer.authUserId },
      create: {
        authUserId: RESTAURANT_QA_FIXTURE.customer.authUserId,
        displayName: "Gate 2D QA Customer",
        firstName: "Gate 2D QA Customer",
        id: RESTAURANT_QA_FIXTURE.customer.id,
        isOnboarded: true,
        phone: "+9647500000082",
        status: "ACTIVE",
      },
      update: { deletedAt: null, displayName: "Gate 2D QA Customer", isOnboarded: true, phone: "+9647500000082", status: "ACTIVE" },
    });
    return {
      branchId: branch.id,
      businessSlug: organization.slug,
      customerId: RESTAURANT_QA_FIXTURE.customer.id,
      ownerMemberId: ownerMember.id,
    };
  };
  return database.$transaction(operation, { maxWait: 10_000, timeout: 30_000 });
}

async function assertFixtureIdentity(transaction: Prisma.TransactionClient) {
  const [organization, branch, owner, customer] = await Promise.all([
    transaction.organization.findUnique({ where: { slug: RESTAURANT_QA_FIXTURE.organization.slug }, select: { id: true } }),
    transaction.branch.findUnique({ where: { id: RESTAURANT_QA_FIXTURE.branch.id }, select: { organizationId: true } }),
    transaction.person.findUnique({ where: { authUserId: RESTAURANT_QA_FIXTURE.ownerPerson.authUserId }, select: { id: true } }),
    transaction.person.findUnique({ where: { authUserId: RESTAURANT_QA_FIXTURE.customer.authUserId }, select: { id: true } }),
  ]);
  if (organization && organization.id !== RESTAURANT_QA_FIXTURE.organization.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA organization slug is owned by another record.");
  }
  if (branch && branch.organizationId !== RESTAURANT_QA_FIXTURE.organization.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA branch is owned by another organization.");
  }
  if (owner && owner.id !== RESTAURANT_QA_FIXTURE.ownerPerson.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA owner identity is owned by another record.");
  }
  if (customer && customer.id !== RESTAURANT_QA_FIXTURE.customer.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA customer identity is owned by another record.");
  }
}
