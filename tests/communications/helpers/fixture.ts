import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { SystemRole } from "@prisma/client";

import type { CommunicationAdminContext } from "../../../features/communications/services/admin-actor";
import { prisma } from "../../../lib/db/prisma";

export async function resetCommunicationTestDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/, "Gate 4C requires a disposable test database.");
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

async function identity(label: string, input: {
  active?: boolean;
  emailVerified?: boolean;
  onboarded?: boolean;
  phone?: string;
  phoneVerified?: boolean;
} = {}) {
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      name: label,
      email: `${label}-${userId.slice(0, 8)}@rezno.invalid`,
      emailVerified: input.emailVerified ?? false,
    },
  });
  const person = await prisma.person.create({
    data: {
      authUserId: userId,
      firstName: label,
      displayName: `${label} display`,
      isOnboarded: input.onboarded ?? true,
      status: input.active === false ? "INACTIVE" : "ACTIVE",
      phone: input.phone,
      phoneVerifiedAt: input.phoneVerified ? new Date() : null,
    },
  });
  return { person, userId };
}

export async function createCommunicationFixture(label = "gate4c") {
  const [fullAdmin, viewAdmin, revokedAdmin, customer, missingEmail, optedOut, phoneCustomer, inactive] = await Promise.all([
    identity(`${label}-full-admin`, { emailVerified: true }),
    identity(`${label}-view-admin`, { emailVerified: true }),
    identity(`${label}-revoked-admin`, { emailVerified: true }),
    identity(`${label}-customer`, { emailVerified: true }),
    identity(`${label}-missing-email`),
    identity(`${label}-opted-out`, { emailVerified: true }),
    identity(`${label}-phone`, { emailVerified: true, phone: "+9647501234567", phoneVerified: true }),
    identity(`${label}-inactive`, { active: false, emailVerified: true }),
  ]);
  const [fullAccess, viewAccess, revokedAccess] = await Promise.all([
    prisma.adminAccess.create({
      data: {
        userId: fullAdmin.userId,
        permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"],
      },
    }),
    prisma.adminAccess.create({
      data: { userId: viewAdmin.userId, permissions: ["NOTIFICATIONS_VIEW"] },
    }),
    prisma.adminAccess.create({
      data: {
        userId: revokedAdmin.userId,
        permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"],
        status: "REVOKED",
      },
    }),
  ]);
  const organization = await prisma.organization.create({
    data: {
      name: `${label} Restaurant`,
      slug: `${label}-${randomUUID().slice(0, 8)}`,
      vertical: "RESTAURANT",
    },
  });

  async function membership(role: SystemRole, suffix: string) {
    const account = await identity(`${label}-${suffix}`, { emailVerified: true });
    const roleRow = await prisma.role.create({
      data: {
        organizationId: organization.id,
        name: `${role}-${suffix}`,
        systemRole: role,
        isSystem: true,
      },
    });
    const member = await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        personId: account.person.id,
        roleId: roleRow.id,
      },
    });
    return { ...account, member, role: roleRow };
  }
  const [owner, manager, staff] = await Promise.all([
    membership("OWNER", "owner"),
    membership("MANAGER", "manager"),
    membership("STAFF", "staff"),
  ]);

  await Promise.all([
    prisma.outboundPreference.create({
      data: {
        personId: customer.person.id,
        emailCategories: ["ADMIN_ANNOUNCEMENT", "ACCOUNT"],
      },
    }),
    prisma.outboundPreference.create({
      data: {
        personId: phoneCustomer.person.id,
        emailCategories: ["ADMIN_ANNOUNCEMENT"],
        smsCategories: ["ADMIN_ANNOUNCEMENT"],
      },
    }),
    prisma.outboundPreference.create({
      data: {
        personId: owner.person.id,
        emailCategories: ["ADMIN_ANNOUNCEMENT"],
      },
    }),
  ]);

  function context(
    account: typeof fullAdmin,
    access: typeof fullAccess,
  ): CommunicationAdminContext {
    return {
      userId: account.userId,
      personId: account.person.id,
      source: "database",
      adminAccessId: access.id,
    };
  }

  return {
    actors: {
      full: context(fullAdmin, fullAccess),
      view: context(viewAdmin, viewAccess),
      revoked: context(revokedAdmin, revokedAccess),
    },
    people: { customer, inactive, missingEmail, optedOut, phoneCustomer },
    organization,
    members: { owner, manager, staff },
  };
}
export function campaignInput(overrides: Record<string, unknown> = {}) {
  return {
    audience: "USER",
    targetPersonId: null,
    targetOrganizationId: null,
    channels: ["IN_APP", "EMAIL"],
    category: "ADMIN_ANNOUNCEMENT",
    priority: "NORMAL",
    mandatory: false,
    destinationKind: "NOTIFICATIONS",
    destinationTargetId: null,
    localizedContent: {
      AR: { inApp: { title: "عنوان آمن", body: "محتوى آمن" }, email: { subject: "عنوان آمن", plainText: "محتوى آمن" }, sms: { text: "رسالة آمنة" }, push: { title: "عنوان", body: "محتوى" } },
      EN: { inApp: { title: "Safe title", body: "Safe content" }, email: { subject: "Safe subject", plainText: "Safe content" }, sms: { text: "Safe SMS" }, push: { title: "Safe title", body: "Safe push" } },
      CKB: { inApp: { title: "ناونیشانی پارێزراو", body: "ناوەڕۆکی پارێزراو" }, email: { subject: "ناونیشان", plainText: "ناوەڕۆک" }, sms: { text: "پەیامی پارێزراو" }, push: { title: "ناونیشان", body: "ناوەڕۆک" } },
    },
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}
