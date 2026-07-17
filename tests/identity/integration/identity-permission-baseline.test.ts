import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { resolveMerchantCommerceContext } from "../../../features/commerce/services/authorization";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import {
  applyOwnerCommerceBackfill,
  listOwnerCommerceBackfillCandidates,
} from "../../../features/identity/services/owner-commerce-backfill";
import { markConversationReadForActor } from "../../../features/messages/services/conversation-read";
import {
  BusinessOnboardingProvisioningError,
  provisionBusinessOnboarding,
} from "../../../features/onboarding/services/business-onboarding";
import { prisma } from "../../../lib/db/prisma";

async function assertDisposableDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_)/,
    "Gate 1A integration tests require a disposable test database.",
  );
}

async function resetTestData() {
  await assertDisposableDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

async function createIdentity(label: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
  const userId = `gate1a-${label}-${randomUUID()}`;
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
      firstName: label,
      isOnboarded: false,
      status,
    },
  });
  return { person, userId };
}

async function createOrganizationWithMember({
  commercePermissions = [] as (typeof OWNER_DEFAULT_COMMERCE_PERMISSIONS)[number][],
  label,
  memberDeletedAt = null as Date | null,
  memberStatus = "ACTIVE" as const,
  organizationStatus = "ACTIVE" as const,
  personStatus = "ACTIVE" as const,
  systemRole = "OWNER" as const,
}: {
  commercePermissions?: (typeof OWNER_DEFAULT_COMMERCE_PERMISSIONS)[number][];
  label: string;
  memberDeletedAt?: Date | null;
  memberStatus?: "ACTIVE" | "INACTIVE";
  organizationStatus?: "ACTIVE" | "INACTIVE";
  personStatus?: "ACTIVE" | "INACTIVE";
  systemRole?: "MANAGER" | "OWNER" | "RECEPTIONIST" | "STAFF";
}) {
  const identity = await createIdentity(`${label}-person`, personStatus);
  await prisma.person.update({
    where: { id: identity.person.id },
    data: { isOnboarded: true },
  });
  const roleId = randomUUID();
  const organization = await prisma.organization.create({
    data: {
      isActive: organizationStatus === "ACTIVE",
      name: label,
      roles: {
        create: {
          commercePermissions,
          id: roleId,
          isSystem: true,
          name: systemRole,
          systemRole,
        },
      },
      slug: `${label}-${randomUUID().slice(0, 8)}`,
      status: organizationStatus,
    },
  });
  const membership = await prisma.organizationMember.create({
    data: {
      deletedAt: memberDeletedAt,
      organizationId: organization.id,
      personId: identity.person.id,
      roleId,
      status: memberStatus,
    },
  });
  return { ...identity, membership, organization, roleId };
}

function expectForbidden(error: unknown) {
  return error instanceof CommerceDomainError && error.code === "FORBIDDEN";
}

test("Gate 1A onboarding, tenant RBAC, backfill, and conversation boundaries", { concurrency: false }, async (t) => {
  await resetTestData();
  t.after(async () => {
    await resetTestData();
    await prisma.$disconnect();
  });

  await t.test("business provisioning is owner-correct, idempotent, session-bound, and private", async () => {
    const creator = await createIdentity("creator");
    const slug = `gate1a-provision-${randomUUID().slice(0, 8)}`;
    const input = {
      branchName: "Main",
      branchSlug: "main",
      organizationName: "Gate 1A Organization",
      organizationSlug: slug,
      personId: creator.person.id,
      vertical: "BEAUTY" as const,
    };

    const first = await provisionBusinessOnboarding(input);
    const replay = await provisionBusinessOnboarding(input);
    assert.equal(first.created, true);
    assert.deepEqual(replay, {
      created: false,
      organizationId: first.organizationId,
    });

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: first.organizationId },
      include: {
        organizationMembers: { include: { role: true } },
        store: true,
      },
    });
    assert.equal(organization.organizationMembers.length, 1);
    assert.equal(organization.organizationMembers[0]?.personId, creator.person.id);
    assert.equal(organization.organizationMembers[0]?.role.systemRole, "OWNER");
    assert.deepEqual(
      new Set(organization.organizationMembers[0]?.role.commercePermissions),
      new Set(OWNER_DEFAULT_COMMERCE_PERMISSIONS),
    );
    assert.equal(organization.store, null, "onboarding must not expose a Store");
    assert.equal(
      await prisma.adminAccess.count({ where: { userId: creator.userId } }),
      0,
      "organization ownership must not create platform-admin access",
    );

    const arbitrary = await createIdentity("arbitrary");
    await assert.rejects(
      provisionBusinessOnboarding({ ...input, personId: arbitrary.person.id }),
      (error) =>
        error instanceof BusinessOnboardingProvisioningError &&
        error.code === "SLUG_TAKEN",
    );
    assert.equal(
      await prisma.organizationMember.count({
        where: { organizationId: organization.id, personId: arbitrary.person.id },
      }),
      0,
    );
  });

  await t.test("a partial provisioning failure rolls back every write", async () => {
    const creator = await createIdentity("rollback");
    const slug = `gate1a-rollback-${randomUUID().slice(0, 8)}`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION gate1a_reject_membership() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'gate1a rollback probe';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER gate1a_reject_membership_trigger
      BEFORE INSERT ON "OrganizationMember"
      FOR EACH ROW EXECUTE FUNCTION gate1a_reject_membership();
    `);

    try {
      await assert.rejects(
        provisionBusinessOnboarding({
          branchName: "Main",
          branchSlug: "main",
          organizationName: "Rollback Probe",
          organizationSlug: slug,
          personId: creator.person.id,
          vertical: "OTHER",
        }),
        /gate1a rollback probe/,
      );
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS gate1a_reject_membership_trigger ON "OrganizationMember";
        DROP FUNCTION IF EXISTS gate1a_reject_membership();
      `);
    }

    assert.equal(await prisma.organization.count({ where: { slug } }), 0);
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: creator.person.id } })).isOnboarded,
      false,
    );
  });

  await t.test("owner backfill is review-gated, scoped, and idempotent", async () => {
    const eligible = await createOrganizationWithMember({ label: "backfill-eligible" });
    const manager = await createOrganizationWithMember({ label: "backfill-manager", systemRole: "MANAGER" });
    const receptionist = await createOrganizationWithMember({ label: "backfill-receptionist", systemRole: "RECEPTIONIST" });
    const staff = await createOrganizationWithMember({ label: "backfill-staff", systemRole: "STAFF" });
    const inactive = await createOrganizationWithMember({ label: "backfill-inactive", memberStatus: "INACTIVE" });
    const deleted = await createOrganizationWithMember({ label: "backfill-deleted", memberDeletedAt: new Date() });
    const suspended = await createOrganizationWithMember({ label: "backfill-suspended", organizationStatus: "INACTIVE" });

    const candidates = await listOwnerCommerceBackfillCandidates();
    assert.deepEqual(candidates.map((candidate) => candidate.roleId), [eligible.roleId]);
    await assert.rejects(
      applyOwnerCommerceBackfill([manager.roleId]),
      /candidates changed after review/,
    );

    assert.deepEqual(await applyOwnerCommerceBackfill([eligible.roleId]), { updatedCount: 1 });
    assert.deepEqual(await listOwnerCommerceBackfillCandidates(), []);
    assert.deepEqual(await applyOwnerCommerceBackfill([]), { updatedCount: 0 });

    const roles = await prisma.role.findMany({
      where: { id: { in: [eligible.roleId, manager.roleId, receptionist.roleId, staff.roleId, inactive.roleId, deleted.roleId, suspended.roleId] } },
      select: { commercePermissions: true, id: true },
    });
    assert.equal(roles.find((role) => role.id === eligible.roleId)?.commercePermissions.length, 12);
    for (const roleId of [manager.roleId, receptionist.roleId, staff.roleId, inactive.roleId, deleted.roleId, suspended.roleId]) {
      assert.deepEqual(roles.find((role) => role.id === roleId)?.commercePermissions, []);
    }
  });

  await t.test("Commerce authorization rejects IDOR, stale membership, suspended tenants, and missing permissions", async () => {
    const ownerA = await createOrganizationWithMember({
      commercePermissions: [...OWNER_DEFAULT_COMMERCE_PERMISSIONS],
      label: "rbac-owner-a",
    });
    const ownerB = await createOrganizationWithMember({
      commercePermissions: [...OWNER_DEFAULT_COMMERCE_PERMISSIONS],
      label: "rbac-owner-b",
    });
    const staff = await createOrganizationWithMember({
      commercePermissions: ["STORE_MANAGE", "PRODUCT_CREATE"],
      label: "rbac-staff",
      systemRole: "STAFF",
    });
    const inactive = await createOrganizationWithMember({
      commercePermissions: ["PRODUCT_CREATE"],
      label: "rbac-inactive",
      memberStatus: "INACTIVE",
    });
    const deleted = await createOrganizationWithMember({
      commercePermissions: ["PRODUCT_CREATE"],
      label: "rbac-deleted",
      memberDeletedAt: new Date(),
    });
    const suspended = await createOrganizationWithMember({
      commercePermissions: ["PRODUCT_CREATE"],
      label: "rbac-suspended",
      organizationStatus: "INACTIVE",
    });
    const customer = await createIdentity("rbac-customer");

    await resolveMerchantCommerceContext(
      {
        contextOrganizationId: ownerA.organization.id,
        membershipId: ownerA.membership.id,
        personId: ownerA.person.id,
      },
      "STORE_MANAGE",
    );

    for (const [identity, permission] of [
      [{ contextOrganizationId: ownerA.organization.id, membershipId: ownerA.membership.id, personId: customer.person.id }, "STORE_MANAGE"],
      [{ contextOrganizationId: ownerB.organization.id, membershipId: ownerB.membership.id, personId: ownerA.person.id }, "STORE_MANAGE"],
      [{ contextOrganizationId: staff.organization.id, membershipId: staff.membership.id, personId: staff.person.id }, "STORE_MANAGE"],
      [{ contextOrganizationId: staff.organization.id, membershipId: staff.membership.id, personId: staff.person.id }, "INVENTORY_ADJUST"],
      [{ contextOrganizationId: staff.organization.id, membershipId: staff.membership.id, personId: staff.person.id }, "PRODUCT_CREATE"],
      [{ contextOrganizationId: inactive.organization.id, membershipId: inactive.membership.id, personId: inactive.person.id }, "PRODUCT_CREATE"],
      [{ contextOrganizationId: deleted.organization.id, membershipId: deleted.membership.id, personId: deleted.person.id }, "PRODUCT_CREATE"],
      [{ contextOrganizationId: suspended.organization.id, membershipId: suspended.membership.id, personId: suspended.person.id }, "PRODUCT_CREATE"],
    ] as const) {
      await assert.rejects(
        resolveMerchantCommerceContext(identity, permission),
        expectForbidden,
      );
    }
  });

  await t.test("read mutation checks participant and admin context before changing rows", async () => {
    const adminA = await createIdentity("message-admin-a");
    const adminB = await createIdentity("message-admin-b");
    const customer = await createIdentity("message-customer");
    const business = await createOrganizationWithMember({ label: "message-business" });
    const otherBusiness = await createOrganizationWithMember({ label: "message-business-other" });

    const adminConversation = await prisma.conversation.create({
      data: {
        adminUserId: adminA.userId,
        customerId: customer.person.id,
        messages: { create: { body: "reply", senderUserId: customer.userId } },
        type: "ADMIN_USER",
      },
      include: { messages: true },
    });
    const businessConversation = await prisma.conversation.create({
      data: {
        businessId: business.organization.id,
        customerId: customer.person.id,
        messages: { create: { body: "customer message", senderUserId: customer.userId } },
        type: "CUSTOMER_BUSINESS",
      },
      include: { messages: true },
    });

    const wrongAdmin = await markConversationReadForActor({
      actor: { kind: "admin", userId: adminB.userId },
      conversationId: adminConversation.id,
      currentUserId: adminB.userId,
    });
    assert.deepEqual(wrongAdmin, { authorized: false, updatedCount: 0 });
    assert.equal(
      (await prisma.message.findUniqueOrThrow({ where: { id: adminConversation.messages[0]!.id } })).readAt,
      null,
    );

    const ownAdmin = await markConversationReadForActor({
      actor: { kind: "admin", userId: adminA.userId },
      conversationId: adminConversation.id,
      currentUserId: adminA.userId,
    });
    assert.deepEqual(ownAdmin, { authorized: true, updatedCount: 1 });

    const crossTenant = await markConversationReadForActor({
      actor: {
        kind: "business",
        organizationId: otherBusiness.organization.id,
        systemRole: "OWNER",
      },
      conversationId: businessConversation.id,
      currentUserId: otherBusiness.userId,
    });
    assert.deepEqual(crossTenant, { authorized: false, updatedCount: 0 });

    const staffSameTenant = await markConversationReadForActor({
      actor: {
        kind: "business",
        organizationId: business.organization.id,
        systemRole: "STAFF",
      },
      conversationId: businessConversation.id,
      currentUserId: business.userId,
    });
    assert.deepEqual(staffSameTenant, { authorized: false, updatedCount: 0 });

    const owner = await markConversationReadForActor({
      actor: {
        kind: "business",
        organizationId: business.organization.id,
        systemRole: "OWNER",
      },
      conversationId: businessConversation.id,
      currentUserId: business.userId,
    });
    assert.deepEqual(owner, { authorized: true, updatedCount: 1 });
  });
});
