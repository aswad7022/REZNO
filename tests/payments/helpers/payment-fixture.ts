import { randomUUID } from "node:crypto";

import type { CommerceAdminContext, MerchantActorReference } from "../../../features/commerce/services/authorization";
import { prisma } from "../../../lib/db/prisma";
import { createStorageFixture, resetStorageTestDatabase } from "../../storage/helpers/storage-fixture";

export async function createPaymentFixture(label = "gate5c") {
  await resetStorageTestDatabase();
  const base = await createStorageFixture(label);
  await Promise.all([
    prisma.organizationSettings.create({ data: { allowOnlinePayments: true, organizationId: base.organization.id } }),
    prisma.organizationSettings.create({ data: { allowOnlinePayments: true, organizationId: base.foreignOrganization.id } }),
  ]);
  const [store, foreignStore, branch] = await Promise.all([
    prisma.store.create({ data: { name: `${label} store`, organizationId: base.organization.id, slug: `${label}-store-${randomUUID().slice(0, 8)}` } }),
    prisma.store.create({ data: { name: `${label} foreign`, organizationId: base.foreignOrganization.id, slug: `${label}-foreign-${randomUUID().slice(0, 8)}` } }),
    prisma.branch.create({ data: { name: `${label} branch`, organizationId: base.organization.id, slug: `${label}-branch-${randomUUID().slice(0, 8)}` } }),
  ]);
  const adminPermissions = ["PAYMENTS_VIEW", "PAYMENTS_REFUND", "PAYMENTS_RECONCILE", "SETTLEMENTS_VIEW", "SETTLEMENTS_MANAGE"] as const;
  await Promise.all([
    prisma.adminAccess.update({ where: { id: base.adminAccess.id }, data: { permissions: [...adminPermissions] } }),
    prisma.role.update({
      where: { id: base.actors.manager.roleId },
      data: { commercePermissions: ["PAYMENT_VIEW", "PAYMENT_REFUND", "SETTLEMENT_VIEW"] },
    }),
  ]);
  const adminContext: CommerceAdminContext = {
    adminAccessId: base.adminAccess.id,
    isSuperAdmin: false,
    personId: base.actors.admin.personId,
    permissions: [...adminPermissions],
    source: "database",
    userId: base.actors.admin.userId,
  };
  return {
    ...base,
    adminContext,
    branch,
    foreignStore,
    store,
    ownerReference: merchantReference(base.owner.actor),
    managerReference: merchantReference(base.actors.manager),
    receptionistReference: merchantReference(base.actors.receptionist),
    staffReference: merchantReference(base.actors.staff),
    revokedReference: merchantReference(base.actors.revoked),
  };
}

export function createPayableOrder(input: { customerId: string; storeId: string; total?: string }) {
  const total = input.total ?? "10000.000";
  return prisma.order.create({
    data: {
      currency: "IQD",
      customerId: input.customerId,
      customerNameSnapshot: "Gate 5C customer",
      customerPhoneSnapshot: "+9647000000000",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: total,
      orderNumber: `G5C-${randomUUID().slice(0, 12)}`,
      paymentMethod: "PAY_AT_PICKUP",
      pickupAddressSnapshot: "Test pickup",
      reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      storeId: input.storeId,
      storeNameSnapshot: "Gate 5C store",
      storeSlugSnapshot: `gate5c-${randomUUID().slice(0, 8)}`,
      subtotal: total,
      payment: { create: { amount: total, currency: "IQD", method: "PAY_AT_PICKUP" } },
    },
    include: { payment: true },
  });
}

export function createPayableBooking(input: { branchId: string; customerId: string; organizationId: string; total?: string }) {
  return prisma.booking.create({
    data: {
      branchId: input.branchId,
      currency: "IQD",
      customerId: input.customerId,
      customerNameSnapshot: "Gate 5C customer",
      endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      organizationId: input.organizationId,
      priceSnapshot: input.total ?? "15000.00",
      serviceNameSnapshot: "Gate 5C booking",
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

function merchantReference(actor: { membershipId: string; organizationId: string; personId: string }): MerchantActorReference {
  return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
}
