import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CommercePermission } from "@prisma/client";

import { prisma } from "../../../lib/db/prisma";

export const ALL_COMMERCE_PERMISSIONS: CommercePermission[] = [
  "STORE_VIEW",
  "STORE_MANAGE",
  "PRODUCT_VIEW",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "INVENTORY_VIEW",
  "INVENTORY_ADJUST",
  "ORDER_VIEW",
  "ORDER_MANAGE",
  "ORDER_CANCEL",
  "REPORTS_VIEW",
];

export async function assertMilestone2cTestDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
}

export async function resetMilestone2cTestData() {
  await assertMilestone2cTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

export async function createTestPerson(label: string) {
  return prisma.person.create({
    data: {
      authUserId: `auth-${label}-${randomUUID()}`,
      displayName: `${label} Customer`,
      firstName: label,
      isOnboarded: true,
      phone: "+9647500000000",
    },
  });
}

export async function createTestMerchant(
  label: string,
  permissions: CommercePermission[] = ALL_COMMERCE_PERMISSIONS,
) {
  const person = await createTestPerson(`${label}-merchant`);
  const roleId = randomUUID();
  const organization = await prisma.organization.create({
    data: {
      name: `${label} Organization`,
      roles: {
        create: {
          commercePermissions: permissions,
          id: roleId,
          isSystem: true,
          name: "Commerce Role",
          systemRole: "OWNER",
        },
      },
      slug: `${label}-${randomUUID().slice(0, 8)}`,
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, personId: person.id, roleId },
  });
  return {
    identity: { organizationId: organization.id, personId: person.id },
    organization,
    person,
  };
}

export async function createTestStoreCatalog(
  label: string,
  organizationId: string,
  categoryId: string,
  options: { deliveryEnabled?: boolean; pickupEnabled?: boolean; price?: string; stock?: number } = {},
) {
  const store = await prisma.store.create({
    data: {
      deliveryArea: "Karrada",
      deliveryCity: "Baghdad",
      deliveryEnabled: options.deliveryEnabled ?? true,
      deliveryEstimateMinutes: 45,
      deliveryFee: "1000",
      minimumOrderValue: "0",
      name: `${label} Store`,
      organizationId,
      pickupArea: "Karrada",
      pickupCity: "Baghdad",
      pickupEnabled: options.pickupEnabled ?? true,
      pickupInstructions: "Bring the order reference.",
      pickupStreet: "Commerce Street",
      preparationEstimateMinutes: 20,
      publishedAt: new Date(),
      slug: `${label}-store-${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
      supportPhone: "+9647500000001",
    },
  });
  const product = await prisma.product.create({
    data: {
      categoryId,
      description: "Milestone 2C test Product",
      name: `${label} Product`,
      normalizedSearchText: `${label} product`,
      publishedAt: new Date(),
      slug: `${label}-product`,
      status: "PUBLISHED",
      storeId: store.id,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      inventory: { create: { onHand: options.stock ?? 20 } },
      isDefault: true,
      optionKey: "default",
      optionValues: { size: "default" },
      price: options.price ?? "10000",
      productId: product.id,
      sku: `${label.toUpperCase()}-${randomUUID().slice(0, 8)}`,
      storeId: store.id,
      title: "Default",
    },
    include: { inventory: true },
  });
  await prisma.productMedia.create({
    data: {
      altText: `${label} Product`,
      productId: product.id,
      sortOrder: 0,
      url: `https://example.invalid/${label}.jpg`,
    },
  });
  return { inventory: variant.inventory!, product, store, variant };
}

export async function seedMilestone2cFixture() {
  await resetMilestone2cTestData();
  const category = await prisma.marketplaceCategory.create({
    data: { name: "Commerce Test", normalizedName: "commerce test", slug: "commerce-test" },
  });
  const merchantA = await createTestMerchant("merchant-a");
  const merchantB = await createTestMerchant("merchant-b");
  const merchantNoPermissions = await createTestMerchant("merchant-no-permissions", []);
  const catalogA = await createTestStoreCatalog("catalog-a", merchantA.organization.id, category.id);
  const catalogB = await createTestStoreCatalog("catalog-b", merchantB.organization.id, category.id);
  const customers = await Promise.all(
    ["customer-a", "customer-b", "customer-c", "customer-d", "customer-e", "customer-f"].map(
      createTestPerson,
    ),
  );
  return { catalogA, catalogB, category, customers, merchantA, merchantB, merchantNoPermissions };
}

export async function prepareMilestone2cHttpFixture(input: {
  customerAEmail: string;
  customerBEmail: string;
  merchantEmail: string;
  merchantNoPermissionEmail: string;
}) {
  const entries = await Promise.all(
    Object.entries(input).map(async ([key, email]) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const person = await prisma.person.update({
        where: { authUserId: user.id },
        data: { isOnboarded: true, phone: "+9647500000000" },
      });
      return [key, { person, user }] as const;
    }),
  );
  const identities = Object.fromEntries(entries) as Record<keyof typeof input, (typeof entries)[number][1]>;
  const category = await prisma.marketplaceCategory.create({
    data: { name: "HTTP Commerce", normalizedName: "http commerce", slug: "http-commerce" },
  });
  const merchant = await attachHttpMerchant("http-merchant", identities.merchantEmail.person.id, ALL_COMMERCE_PERMISSIONS);
  const noPermissionMerchant = await attachHttpMerchant(
    "http-no-permission",
    identities.merchantNoPermissionEmail.person.id,
    [],
  );
  const catalogA = await createTestStoreCatalog("http-a", merchant.organization.id, category.id);
  const catalogBMerchant = await createTestMerchant("http-catalog-b");
  const catalogB = await createTestStoreCatalog("http-b", catalogBMerchant.organization.id, category.id);
  return {
    catalogA,
    catalogB,
    customerA: identities.customerAEmail,
    customerB: identities.customerBEmail,
    merchant,
    noPermissionMerchant,
  };
}

async function attachHttpMerchant(
  label: string,
  personId: string,
  permissions: CommercePermission[],
) {
  const roleId = randomUUID();
  const organization = await prisma.organization.create({
    data: {
      name: `${label} Organization`,
      roles: {
        create: {
          commercePermissions: permissions,
          id: roleId,
          isSystem: true,
          name: "HTTP Commerce Role",
          systemRole: "OWNER",
        },
      },
      slug: `${label}-${randomUUID().slice(0, 8)}`,
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, personId, roleId },
  });
  return { identity: { organizationId: organization.id, personId }, organization };
}
