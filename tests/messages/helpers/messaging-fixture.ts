import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { SystemRole } from "@prisma/client";

import type {
  AdminMessageActor,
  BusinessMessageActor,
  CustomerMessageActor,
} from "../../../features/messages/domain/contracts";
import { prisma } from "../../../lib/db/prisma";

export async function assertMessagingTestDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_)/,
    "Messaging integration tests require a disposable test database.",
  );
}

export async function resetMessagingTestDatabase() {
  await assertMessagingTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

async function identity(label: string) {
  const userId = `gate4b-${label}-${randomUUID()}`;
  await prisma.user.create({
    data: {
      email: `${userId}@rezno.invalid`,
      id: userId,
      name: label,
    },
  });
  const person = await prisma.person.create({
    data: {
      authUserId: userId,
      displayName: `${label} display`,
      firstName: label,
      isOnboarded: true,
      status: "ACTIVE",
    },
  });
  return { person, userId };
}

export async function createMessagingFixture(label = "fixture") {
  const [customer, foreignCustomer, admin] = await Promise.all([
    identity(`${label}-customer`),
    identity(`${label}-foreign-customer`),
    identity(`${label}-admin`),
  ]);
  await prisma.adminAccess.create({
    data: {
      permissions: ["MESSAGES_SEND", "MESSAGES_VIEW"],
      userId: admin.userId,
    },
  });
  const [organization, foreignOrganization] = await Promise.all([
    prisma.organization.create({
      data: { name: `${label} Business`, slug: `${label}-${randomUUID().slice(0, 8)}` },
    }),
    prisma.organization.create({
      data: { name: `${label} Foreign`, slug: `${label}-foreign-${randomUUID().slice(0, 8)}` },
    }),
  ]);
  const [branch, foreignBranch] = await Promise.all([
    prisma.branch.create({
      data: { name: "Main", organizationId: organization.id, slug: "main" },
    }),
    prisma.branch.create({
      data: { name: "Foreign", organizationId: foreignOrganization.id, slug: "foreign" },
    }),
  ]);

  async function member(role: SystemRole, suffix: string, target = organization) {
    const account = await identity(`${label}-${suffix}`);
    const roleRow = await prisma.role.create({
      data: {
        isSystem: true,
        name: `${role}-${suffix}`,
        organizationId: target.id,
        systemRole: role,
      },
    });
    const membership = await prisma.organizationMember.create({
      data: {
        organizationId: target.id,
        personId: account.person.id,
        roleId: roleRow.id,
      },
    });
    const actor: BusinessMessageActor = {
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

  const [owner, manager, receptionist, assignedStaff, unassignedStaff, foreignOwner] = await Promise.all([
    member("OWNER", "owner"),
    member("MANAGER", "manager"),
    member("RECEPTIONIST", "receptionist"),
    member("STAFF", "assigned-staff"),
    member("STAFF", "unassigned-staff"),
    member("OWNER", "foreign-owner", foreignOrganization),
  ]);
  const startsAt = new Date("2026-09-15T10:00:00.000Z");
  const booking = await prisma.booking.create({
    data: {
      branchId: branch.id,
      customerId: customer.person.id,
      customerNameSnapshot: "PRIVATE CUSTOMER SNAPSHOT",
      endsAt: new Date("2026-09-15T11:00:00.000Z"),
      memberId: assignedStaff.membership.id,
      organizationId: organization.id,
      priceSnapshot: "25000",
      serviceNameSnapshot: "Gate 4B service",
      startsAt,
    },
  });
  const foreignBooking = await prisma.booking.create({
    data: {
      branchId: foreignBranch.id,
      customerId: foreignCustomer.person.id,
      customerNameSnapshot: "FOREIGN PRIVATE SNAPSHOT",
      endsAt: new Date("2026-09-16T11:00:00.000Z"),
      organizationId: foreignOrganization.id,
      priceSnapshot: "10000",
      serviceNameSnapshot: "Foreign service",
      startsAt: new Date("2026-09-16T10:00:00.000Z"),
    },
  });

  const customerActor: CustomerMessageActor = {
    kind: "customer",
    personId: customer.person.id,
    userId: customer.userId,
  };
  const foreignCustomerActor: CustomerMessageActor = {
    kind: "customer",
    personId: foreignCustomer.person.id,
    userId: foreignCustomer.userId,
  };
  const adminActor: AdminMessageActor = {
    adminSource: "database",
    canSend: true,
    kind: "admin",
    personId: admin.person.id,
    userId: admin.userId,
  };

  return {
    actors: {
      admin: adminActor,
      assignedStaff: assignedStaff.actor,
      customer: customerActor,
      foreignCustomer: foreignCustomerActor,
      foreignOwner: foreignOwner.actor,
      manager: manager.actor,
      owner: owner.actor,
      receptionist: receptionist.actor,
      unassignedStaff: unassignedStaff.actor,
    },
    admin,
    booking,
    branch,
    customer,
    foreignBooking,
    foreignCustomer,
    foreignOrganization,
    organization,
  };
}
