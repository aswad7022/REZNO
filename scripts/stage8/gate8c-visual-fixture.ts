import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import type { LanguageCode } from "@prisma/client";

import { prisma } from "../../lib/db/prisma";
import {
  gate8cCanonicalJson,
  gate8cSha256,
  gate8cVisualAuthMaterial,
} from "./gate8c-production-harness";
import type { Gate8cLocale } from "./gate8c-visual-evidence";

const fixedAt = new Date("2026-07-01T08:00:00.000Z");
const sessionUpdatedAt = new Date("2034-01-01T00:00:00.000Z");
const sessionExpiresAt = new Date("2035-01-01T00:00:00.000Z");

const ids = {
  adminUser: "gate8c-visual-admin-user",
  adminPerson: "80000000-0000-4000-8000-000000000001",
  adminSession: "gate8c-visual-admin-session",
  adminToken: "gate8c-visual-admin-token-v1",
  businessUser: "gate8c-visual-business-user",
  businessPerson: "80000000-0000-4000-8000-000000000002",
  businessSession: "gate8c-visual-business-session",
  businessToken: "gate8c-visual-business-token-v1",
  candidateUser: "gate8c-visual-candidate-user",
  candidatePerson: "80000000-0000-4000-8000-000000000003",
  candidateSession: "gate8c-visual-candidate-session",
  candidateToken: "gate8c-visual-candidate-token-v1",
  communicationsViewerUser: "gate8c-visual-communications-viewer-user",
  communicationsViewerPerson: "80000000-0000-4000-8000-000000000005",
  communicationsViewerSession: "gate8c-visual-communications-viewer-session",
  communicationsViewerToken: "gate8c-visual-communications-viewer-token-v1",
  communicationsViewerAccess: "80000000-0000-4000-8000-000000000006",
  customerUser: "gate8c-visual-customer-user",
  customerPerson: "80000000-0000-4000-8000-000000000004",
  organization: "80000000-0000-4000-8000-000000000010",
  organizationRole: "80000000-0000-4000-8000-000000000011",
  organizationMember: "80000000-0000-4000-8000-000000000012",
  branch: "80000000-0000-4000-8000-000000000013",
  category: "80000000-0000-4000-8000-000000000014",
  service: "80000000-0000-4000-8000-000000000015",
  offering: "80000000-0000-4000-8000-000000000016",
  booking: "80000000-0000-4000-8000-000000000017",
  store: "80000000-0000-4000-8000-000000000018",
  secondOrganization: "80000000-0000-4000-8000-000000000020",
  secondRole: "80000000-0000-4000-8000-000000000021",
  secondMembership: "80000000-0000-4000-8000-000000000022",
} as const;

const emails = {
  admin: "visual-fixture-admin@fixtures.example",
  business: "visual-fixture-owner@fixtures.example",
  candidate: "visual-fixture-candidate@fixtures.example",
  communicationsViewer:
    "visual-fixture-communications-viewer@fixtures.example",
  customer: "visual-fixture-customer@fixtures.example",
} as const;

export type Gate8cVisualRole =
  | "authenticated-non-admin"
  | "business-owner"
  | "communications-viewer"
  | "root-super-admin";

function localeLanguage(locale: Gate8cLocale): LanguageCode {
  if (locale === "ar") return "AR";
  if (locale === "ckb") return "KU";
  return "EN";
}

function roleUserId(role: Gate8cVisualRole) {
  if (role === "root-super-admin") return ids.adminUser;
  if (role === "business-owner") return ids.businessUser;
  if (role === "communications-viewer") {
    return ids.communicationsViewerUser;
  }
  return ids.candidateUser;
}

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", gate8cVisualAuthMaterial())
    .update(token)
    .digest("base64");
  return `better-auth.session_token=${token}.${signature}`;
}

async function assertDisposableDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_)/,
    "Gate 8C visual fixtures require a disposable test database.",
  );
}

async function resetGate8cVisualData() {
  await assertDisposableDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
  await prisma.distributedRateLimitBucket.deleteMany();
}

async function waitForGate8cVisualDatabaseIdle() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const active = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state <> 'idle'
    `;
    if (Number(active[0]?.count ?? 0) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    "Gate 8C fixture cleanup refused to race an active database request.",
  );
}

async function createIdentity(input: {
  email: string;
  firstName: string;
  personId: string;
  sessionId?: string;
  sessionToken?: string;
  userId: string;
}) {
  await prisma.user.create({
    data: {
      createdAt: fixedAt,
      email: input.email,
      emailVerified: true,
      id: input.userId,
      name: input.firstName,
      updatedAt: fixedAt,
    },
  });
  await prisma.person.create({
    data: {
      authUserId: input.userId,
      createdAt: fixedAt,
      firstName: input.firstName,
      id: input.personId,
      isOnboarded: true,
      phone: null,
      preferredLanguage: "EN",
      status: "ACTIVE",
      timezone: "UTC",
      updatedAt: fixedAt,
    },
  });
  if (input.sessionId && input.sessionToken) {
    await prisma.session.create({
      data: {
        createdAt: fixedAt,
        expiresAt: sessionExpiresAt,
        id: input.sessionId,
        token: input.sessionToken,
        updatedAt: sessionUpdatedAt,
        userId: input.userId,
      },
    });
  }
}

async function visibleFixtureSnapshot() {
  const [users, people, adminAccess, organizations, memberships, bookings, stores] =
    await Promise.all([
      prisma.user.findMany({
        orderBy: { id: "asc" },
        select: { email: true, id: true, name: true },
      }),
      prisma.person.findMany({
        orderBy: { id: "asc" },
        select: {
          authUserId: true,
          firstName: true,
          id: true,
          phone: true,
          preferredLanguage: true,
        },
      }),
      prisma.adminAccess.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          permissions: true,
          role: true,
          status: true,
          userId: true,
        },
      }),
      prisma.organization.findMany({
        orderBy: { id: "asc" },
        select: { id: true, name: true, slug: true, vertical: true },
      }),
      prisma.organizationMember.findMany({
        orderBy: { id: "asc" },
        select: { id: true, organizationId: true, personId: true },
      }),
      prisma.booking.findMany({
        orderBy: { id: "asc" },
        select: {
          customerNameSnapshot: true,
          endsAt: true,
          id: true,
          serviceNameSnapshot: true,
          startsAt: true,
          status: true,
        },
      }),
      prisma.store.findMany({
        orderBy: { id: "asc" },
        select: { id: true, name: true, slug: true, status: true },
      }),
    ]);
  return {
    adminAccess,
    bookings,
    memberships,
    organizations,
    people,
    stores,
    users,
  };
}

export async function prepareGate8cVisualFixture() {
  await resetGate8cVisualData();
  await createIdentity({
    email: emails.admin,
    firstName: "Visual Fixture Admin",
    personId: ids.adminPerson,
    sessionId: ids.adminSession,
    sessionToken: ids.adminToken,
    userId: ids.adminUser,
  });
  await createIdentity({
    email: emails.business,
    firstName: "Visual Fixture Owner",
    personId: ids.businessPerson,
    sessionId: ids.businessSession,
    sessionToken: ids.businessToken,
    userId: ids.businessUser,
  });
  await createIdentity({
    email: emails.candidate,
    firstName: "Visual Fixture Candidate",
    personId: ids.candidatePerson,
    sessionId: ids.candidateSession,
    sessionToken: ids.candidateToken,
    userId: ids.candidateUser,
  });
  await createIdentity({
    email: emails.communicationsViewer,
    firstName: "Visual Fixture Communications Viewer",
    personId: ids.communicationsViewerPerson,
    sessionId: ids.communicationsViewerSession,
    sessionToken: ids.communicationsViewerToken,
    userId: ids.communicationsViewerUser,
  });
  await prisma.adminAccess.create({
    data: {
      createdAt: fixedAt,
      id: ids.communicationsViewerAccess,
      permissions: ["NOTIFICATIONS_VIEW"],
      role: "ADMIN",
      status: "ACTIVE",
      updatedAt: fixedAt,
      userId: ids.communicationsViewerUser,
    },
  });
  await createIdentity({
    email: emails.customer,
    firstName: "Visual Fixture Customer",
    personId: ids.customerPerson,
    userId: ids.customerUser,
  });

  await prisma.category.create({
    data: {
      createdAt: fixedAt,
      id: ids.category,
      name: "Visual Fixture Category",
      slug: "visual-fixture-category",
      updatedAt: fixedAt,
    },
  });
  await prisma.organization.create({
    data: {
      businessType: "PHYSICAL",
      createdAt: fixedAt,
      id: ids.organization,
      isActive: true,
      isVerified: true,
      name: "Visual Fixture Business",
      profile: {
        create: {
          businessCategory: "Synthetic services",
          createdAt: fixedAt,
          description: "Deterministic visual fixture",
          updatedAt: fixedAt,
        },
      },
      settings: {
        create: {
          bookingEnabled: true,
          cancellationWindowHours: 24,
          createdAt: fixedAt,
          marketplaceVisible: true,
          updatedAt: fixedAt,
        },
      },
      slug: "visual-fixture-business",
      status: "ACTIVE",
      updatedAt: fixedAt,
      vertical: "BEAUTY",
    },
  });
  await prisma.role.create({
    data: {
      createdAt: fixedAt,
      id: ids.organizationRole,
      isSystem: true,
      name: "OWNER",
      organizationId: ids.organization,
      systemRole: "OWNER",
      updatedAt: fixedAt,
    },
  });
  await prisma.organizationMember.create({
    data: {
      createdAt: fixedAt,
      id: ids.organizationMember,
      organizationId: ids.organization,
      personId: ids.businessPerson,
      roleId: ids.organizationRole,
      status: "ACTIVE",
      updatedAt: fixedAt,
    },
  });
  await prisma.branch.create({
    data: {
      city: "Fixture City",
      country: "Fixture Country",
      createdAt: fixedAt,
      id: ids.branch,
      name: "Visual Fixture Branch",
      organizationId: ids.organization,
      slug: "visual-fixture-branch",
      status: "ACTIVE",
      timezone: "UTC",
      updatedAt: fixedAt,
    },
  });
  await prisma.service.create({
    data: {
      categoryId: ids.category,
      createdAt: fixedAt,
      description: "Deterministic fixture service",
      id: ids.service,
      name: "Visual Fixture Service",
      organizationId: ids.organization,
      staffSelectionMode: "NONE",
      status: "ACTIVE",
      updatedAt: fixedAt,
    },
  });
  await prisma.branchService.create({
    data: {
      branchId: ids.branch,
      createdAt: fixedAt,
      durationMinutes: 30,
      id: ids.offering,
      isAvailable: true,
      price: "25000",
      serviceId: ids.service,
      updatedAt: fixedAt,
    },
  });
  await prisma.booking.create({
    data: {
      branchId: ids.branch,
      branchServiceId: ids.offering,
      createdAt: fixedAt,
      customerId: ids.customerPerson,
      customerNameSnapshot: "Visual Fixture Customer",
      endsAt: new Date("2030-01-15T12:30:00.000Z"),
      id: ids.booking,
      organizationId: ids.organization,
      priceSnapshot: "25000",
      serviceNameSnapshot: "Visual Fixture Service",
      startsAt: new Date("2030-01-15T12:00:00.000Z"),
      status: "CONFIRMED",
      updatedAt: fixedAt,
    },
  });
  await prisma.store.create({
    data: {
      createdAt: fixedAt,
      currency: "IQD",
      deliveryEnabled: true,
      id: ids.store,
      name: "Visual Fixture Store",
      organizationId: ids.organization,
      pickupEnabled: true,
      publishedAt: fixedAt,
      slug: "visual-fixture-store",
      status: "ACTIVE",
      updatedAt: fixedAt,
    },
  });

  await prisma.organization.create({
    data: {
      createdAt: fixedAt,
      id: ids.secondOrganization,
      isActive: true,
      name: "Visual Fixture Secondary Business",
      slug: "visual-fixture-secondary-business",
      status: "ACTIVE",
      updatedAt: fixedAt,
      vertical: "OTHER",
    },
  });
  await prisma.role.create({
    data: {
      createdAt: fixedAt,
      id: ids.secondRole,
      isSystem: true,
      name: "OWNER",
      organizationId: ids.secondOrganization,
      systemRole: "OWNER",
      updatedAt: fixedAt,
    },
  });
  await prisma.organizationMember.create({
    data: {
      createdAt: fixedAt,
      id: ids.secondMembership,
      organizationId: ids.secondOrganization,
      personId: ids.businessPerson,
      roleId: ids.secondRole,
      status: "ACTIVE",
      updatedAt: fixedAt,
    },
  });

  const snapshot = await visibleFixtureSnapshot();
  return {
    adminCookie: signedSessionCookie(ids.adminToken),
    businessCookie: `${signedSessionCookie(
      ids.businessToken,
    )}; rezno-active-business-id=${ids.organization}`,
    candidateEmail: emails.candidate,
    candidateUserId: ids.candidateUser,
    communicationsViewerCookie: signedSessionCookie(
      ids.communicationsViewerToken,
    ),
    deniedCookie: signedSessionCookie(ids.candidateToken),
    fixtureFingerprint: gate8cSha256(gate8cCanonicalJson(snapshot)),
  };
}

export async function setGate8cVisualFixtureLocale(
  role: Gate8cVisualRole,
  locale: Gate8cLocale,
) {
  const userId = roleUserId(role);
  const language = localeLanguage(locale);
  await prisma.person.update({
    where: { authUserId: userId },
    data: { preferredLanguage: language, updatedAt: fixedAt },
  });
  return { language, userId };
}

export async function readGate8cVisualFixtureLocale(role: Gate8cVisualRole) {
  const userId = roleUserId(role);
  const person = await prisma.person.findUniqueOrThrow({
    where: { authUserId: userId },
    select: { preferredLanguage: true },
  });
  return { language: person.preferredLanguage, userId };
}

export async function cleanupGate8cVisualFixture() {
  await waitForGate8cVisualDatabaseIdle();
  await resetGate8cVisualData();
}
