import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SystemRole } from "@prisma/client";

import type { StorageBusinessActor, StorageCustomerActor, StorageAdminActor } from "../../../features/storage/services/actor";
import { prisma } from "../../../lib/db/prisma";

export async function resetStorageTestDatabase() {
  const [row] = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(row?.database ?? "", /(?:_test|test_|gate5a)/, "Storage integration tests require a disposable database.");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

async function identity(label: string) {
  const userId = `gate5a-${label}-${randomUUID()}`;
  await prisma.user.create({ data: { email: `${userId}@rezno.invalid`, id: userId, name: label } });
  const person = await prisma.person.create({
    data: { authUserId: userId, firstName: label, isOnboarded: true, status: "ACTIVE" },
  });
  return { person, userId };
}

export async function createStorageFixture(label = "storage") {
  const [customer, foreignCustomer, adminIdentity, viewAdminIdentity] = await Promise.all([
    identity(`${label}-customer`),
    identity(`${label}-foreign-customer`),
    identity(`${label}-admin`),
    identity(`${label}-view-admin`),
  ]);
  const adminAccess = await prisma.adminAccess.create({
    data: { permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], userId: adminIdentity.userId },
  });
  const viewAdminAccess = await prisma.adminAccess.create({
    data: { permissions: ["STORAGE_RECORDS_VIEW"], userId: viewAdminIdentity.userId },
  });
  const [organization, foreignOrganization] = await Promise.all([
    prisma.organization.create({ data: { name: `${label} Org`, slug: `${label}-${randomUUID().slice(0, 8)}` } }),
    prisma.organization.create({ data: { name: `${label} Foreign`, slug: `${label}-foreign-${randomUUID().slice(0, 8)}` } }),
  ]);

  async function member(role: SystemRole, suffix: string, target = organization) {
    const account = await identity(`${label}-${suffix}`);
    const roleRow = await prisma.role.create({
      data: { isSystem: true, name: `${role}-${suffix}`, organizationId: target.id, systemRole: role },
    });
    const membership = await prisma.organizationMember.create({
      data: { organizationId: target.id, personId: account.person.id, roleId: roleRow.id },
    });
    const actor: StorageBusinessActor = {
      kind: "business",
      membershipId: membership.id,
      organizationId: target.id,
      personId: account.person.id,
      roleId: roleRow.id,
      systemRole: role,
      userId: account.userId,
    };
    return { ...account, actor, membership, role: roleRow };
  }
  const [owner, manager, receptionist, staff, revoked, foreignOwner] = await Promise.all([
    member("OWNER", "owner"),
    member("MANAGER", "manager"),
    member("RECEPTIONIST", "receptionist"),
    member("STAFF", "staff"),
    member("MANAGER", "revoked"),
    member("OWNER", "foreign-owner", foreignOrganization),
  ]);
  await prisma.organizationMember.update({ where: { id: revoked.membership.id }, data: { status: "INACTIVE" } });
  const customerActor: StorageCustomerActor = { kind: "customer", personId: customer.person.id, userId: customer.userId };
  const foreignCustomerActor: StorageCustomerActor = { kind: "customer", personId: foreignCustomer.person.id, userId: foreignCustomer.userId };
  const admin: StorageAdminActor = {
    adminAccessId: adminAccess.id,
    kind: "admin",
    personId: adminIdentity.person.id,
    source: "database",
    userId: adminIdentity.userId,
  };
  const viewAdmin: StorageAdminActor = {
    adminAccessId: viewAdminAccess.id,
    kind: "admin",
    personId: viewAdminIdentity.person.id,
    source: "database",
    userId: viewAdminIdentity.userId,
  };
  return {
    actors: {
      admin,
      customer: customerActor,
      foreignCustomer: foreignCustomerActor,
      foreignOwner: foreignOwner.actor,
      manager: manager.actor,
      owner: owner.actor,
      receptionist: receptionist.actor,
      revoked: revoked.actor,
      staff: staff.actor,
      viewAdmin,
    },
    adminAccess,
    customer,
    foreignOrganization,
    organization,
    owner,
    viewAdminAccess,
  };
}
