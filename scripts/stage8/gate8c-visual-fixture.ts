import assert from "node:assert/strict";

import { prisma } from "../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  createFutureGenericBooking,
  resetBusinessOperationsTestData,
} from "../../tests/business-operations/helpers/business-operations-fixture";

const adminEmail = "gate8c-admin@rezno.invalid";
const businessEmail = "gate8c-business@rezno.invalid";
const candidateEmail = "gate8c-candidate@rezno.invalid";
const password = "Gate8c-Visual-Only-Password";

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

async function signUp(baseUrl: string, email: string, name: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name, password }),
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
    },
    method: "POST",
  });
  assert.equal(response.status, 200, `Unable to create ${email}`);
  const payload = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  assert.ok(cookie, `Missing session cookie for ${email}`);
  await prisma.distributedRateLimitBucket.deleteMany();
  return {
    cookie: cookie.split(";")[0]!,
    userId: payload.user.id,
  };
}

export async function prepareGate8cVisualFixture(baseUrl: string) {
  await assertDisposableDatabase();
  await resetBusinessOperationsTestData();
  await prisma.distributedRateLimitBucket.deleteMany();

  const admin = await signUp(baseUrl, adminEmail, "Gate 8C Root Admin");
  const business = await signUp(
    baseUrl,
    businessEmail,
    "Gate 8C Business Owner",
  );
  const candidate = await signUp(
    baseUrl,
    candidateEmail,
    "Gate 8C Admin Candidate",
  );

  const fixture = await createBusinessOperationsFixture("gate8c-visual");
  const [adminPerson, businessPerson, candidatePerson] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { authUserId: admin.userId } }),
    prisma.person.findUniqueOrThrow({ where: { authUserId: business.userId } }),
    prisma.person.findUniqueOrThrow({ where: { authUserId: candidate.userId } }),
  ]);
  await Promise.all([
    prisma.person.update({
      where: { id: adminPerson.id },
      data: {
        firstName: "Gate 8C Root Admin",
        isOnboarded: true,
        phone: "+9647500000801",
        status: "ACTIVE",
      },
    }),
    prisma.person.update({
      where: { id: businessPerson.id },
      data: {
        firstName: "مالك النشاط التجريبي",
        isOnboarded: true,
        phone: "+9647500000800",
        status: "ACTIVE",
      },
    }),
    prisma.person.update({
      where: { id: candidatePerson.id },
      data: {
        firstName: "Gate 8C Admin Candidate",
        isOnboarded: true,
        phone: "+9647500000802",
        status: "ACTIVE",
      },
    }),
    prisma.organizationMember.update({
      where: { id: fixture.owner.membership.id },
      data: { personId: businessPerson.id },
    }),
    prisma.organizationMember.update({
      where: { id: fixture.ownerB.membership.id },
      data: { personId: businessPerson.id },
    }),
    prisma.organization.update({
      where: { id: fixture.organizationA.id },
      data: {
        name: "REZNO Gate 8C Visual Fixture — مؤسسة تجريبية آمنة",
        vertical: "BEAUTY",
      },
    }),
  ]);
  await createFutureGenericBooking(fixture);
  await prisma.store.create({
    data: {
      currency: "IQD",
      deliveryEnabled: true,
      name: "Gate 8C Synthetic Store",
      organizationId: fixture.organizationA.id,
      pickupEnabled: true,
      publishedAt: new Date("2026-07-01T08:00:00.000Z"),
      slug: "gate8c-synthetic-store",
      status: "ACTIVE",
    },
  });

  return {
    adminCookie: admin.cookie,
    businessCookie: `${business.cookie}; rezno-active-business-id=${fixture.organizationA.id}`,
    candidateEmail,
    candidateUserId: candidate.userId,
    deniedCookie: candidate.cookie,
  };
}

export async function cleanupGate8cVisualFixture() {
  await assertDisposableDatabase();
  await resetBusinessOperationsTestData();
  await prisma.distributedRateLimitBucket.deleteMany();
}
