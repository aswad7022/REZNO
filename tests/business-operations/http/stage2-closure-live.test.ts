import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";
import { deferredBusinessRouteRegistry } from "../../../features/dashboard/feature-placeholder";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `stage2d-${label}-${randomUUID().slice(0, 8)}@rezno.invalid`,
      name: label,
      password: "password123",
    }),
    headers: {
      "content-type": "application/json",
      origin: baseUrl!,
      "user-agent": `rezno-stage2d-${label}`,
    },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: {
      isOnboarded: true,
      phone: "+9647500000300",
      status: "ACTIVE",
    },
  });
  return { cookie: cookie.split(";")[0]!, person };
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

async function page(path: string, cookie: string, rsc = false) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      cookie,
      ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}),
    },
    redirect: "manual",
  });
}

async function body(path: string, cookie: string, rsc = false) {
  const response = await page(path, cookie, rsc);
  return { response, text: await response.text() };
}

function assertForbidden(text: string) {
  assert.match(text, /NEXT_HTTP_ERROR_FALLBACK;403/);
}

test(
  "Stage 2D production HTML and RSC enforce the final role and route matrix",
  {
    concurrency: false,
    skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Stage 2D tests",
  },
  async (t) => {
    await resetBusinessOperationsTestData();
    t.after(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await resetBusinessOperationsTestData();
      await prisma.$disconnect();
    });
    const fixture = await createBusinessOperationsFixture("stage2d-http");
    const [ownerSession, receptionistSession, staffSession] =
      await Promise.all([
        signUp("owner"),
        signUp("receptionist"),
        signUp("staff"),
      ]);
    await Promise.all([
      prisma.organizationMember.update({
        where: { id: fixture.owner.membership.id },
        data: { personId: ownerSession.person.id },
      }),
      prisma.organizationMember.update({
        where: { id: fixture.receptionist.membership.id },
        data: { personId: receptionistSession.person.id },
      }),
      prisma.organizationMember.update({
        where: { id: fixture.staff.membership.id },
        data: { personId: staffSession.person.id },
      }),
      prisma.organization.update({
        where: { id: fixture.organizationA.id },
        data: { vertical: "BEAUTY" },
      }),
      prisma.businessProfile.update({
        where: { organizationId: fixture.organizationA.id },
        data: {
          businessCategory: "Beauty",
          businessPhone: "+9647500000310",
          coverImageUrl: "https://example.test/cover.jpg",
          description: "Stage 2D HTTP ready business",
          logoUrl: "https://example.test/logo.jpg",
        },
      }),
      prisma.branch.update({
        where: { id: fixture.activeBranch.id },
        data: { timezone: "UTC" },
      }),
    ]);
    await Promise.all([
      prisma.branchAssignment.create({
        data: {
          branchId: fixture.activeBranch.id,
          memberId: fixture.staff.membership.id,
        },
      }),
      prisma.serviceStaffAssignment.create({
        data: {
          memberId: fixture.staff.membership.id,
          serviceId: fixture.service.id,
        },
      }),
    ]);
    const start = new Date(Date.now() + 60 * 60_000);
    await prisma.booking.create({
      data: {
        branchId: fixture.activeBranch.id,
        branchServiceId: fixture.offering.id,
        customerId: fixture.customer.id,
        customerNameSnapshot: "STAGE2D-HTTP-CUSTOMER-PII-SENTINEL",
        endsAt: new Date(start.getTime() + 30 * 60_000),
        memberId: fixture.staff.membership.id,
        notes: "STAGE2D-HTTP-NOTES-SENTINEL",
        organizationId: fixture.organizationA.id,
        priceSnapshot: "25000",
        serviceNameSnapshot: "STAGE2D-HTTP-SERVICE",
        startsAt: start,
        status: "CONFIRMED",
      },
    });
    const cookies = {
      owner: activeCookie(ownerSession.cookie, fixture.organizationA.id),
      receptionist: activeCookie(
        receptionistSession.cookie,
        fixture.organizationA.id,
      ),
      staff: activeCookie(staffSession.cookie, fixture.organizationA.id),
    };

    await t.test("Owner and Manager receive management overview, analytics, and hub", async () => {
      for (const [role, cookie] of [
        ["owner", cookies.owner],
        ["manager", cookies.owner],
      ] as const) {
        await prisma.organizationMember.update({
          where: { id: fixture.owner.membership.id },
          data: {
            roleId:
              role === "owner"
                ? fixture.owner.membership.roleId
                : fixture.manager.membership.roleId,
          },
        });
        const overview = await body("/business", cookie);
        assert.equal(overview.response.status, 200);
        assert.match(overview.text, /STAGE2D-HTTP-SERVICE/);
        assert.match(overview.text, /href="\/business\/analytics/);
        assert.match(overview.text, /href="\/business\/manage"/);
        assert.match(overview.text, /href="\/business\/public-profile"/);
        assert.equal(overview.text.includes("STAGE2D-HTTP-CUSTOMER-PII-SENTINEL"), false);
        assert.equal(overview.text.includes("STAGE2D-HTTP-NOTES-SENTINEL"), false);
        if (role === "owner") {
          assert.match(overview.text, /href="\/business\/manage\/audit"/);
        } else {
          assert.doesNotMatch(overview.text, /href="\/business\/manage\/audit"/);
        }
        const overviewRsc = await body("/business", cookie, true);
        assert.equal(overviewRsc.response.status, 200);
        assert.equal(overviewRsc.text.includes("STAGE2D-HTTP-CUSTOMER-PII-SENTINEL"), false);
        assert.equal(overviewRsc.text.includes("STAGE2D-HTTP-NOTES-SENTINEL"), false);
        const analytics = await body("/business/analytics?period=7", cookie);
        assert.equal(analytics.response.status, 200);
        assert.doesNotMatch(analytics.text, /NEXT_HTTP_ERROR_FALLBACK;403/);
        assert.equal(analytics.text.includes("STAGE2D-HTTP-CUSTOMER-PII-SENTINEL"), false);
        const management = await body("/business/manage", cookie);
        assert.equal(management.response.status, 200);
        assert.doesNotMatch(management.text, /NEXT_HTTP_ERROR_FALLBACK;403/);
      }
      await prisma.organizationMember.update({
        where: { id: fixture.owner.membership.id },
        data: { roleId: fixture.owner.membership.roleId },
      });
    });

    await t.test("Receptionist receives operational links and direct management denial", async () => {
      const overview = await body("/business", cookies.receptionist);
      assert.equal(overview.response.status, 200);
      assert.match(overview.text, /href="\/business\/calendar"/);
      assert.match(overview.text, /href="\/business\/bookings"/);
      for (const forbiddenHref of [
        "/business/analytics",
        "/business/manage",
        "/business/public-profile",
        "/business/manage/audit",
      ]) {
        assert.equal(overview.text.includes(`href="${forbiddenHref}`), false);
      }
      assert.equal(overview.text.includes("STAGE2D-HTTP-CUSTOMER-PII-SENTINEL"), false);
      for (const path of [
        "/business/analytics",
        "/business/manage",
        "/business/public-profile",
        "/business/manage/audit",
        "/business/reviews",
      ]) {
        assertForbidden((await body(path, cookies.receptionist)).text);
      }
      const locations = await body("/business/manage/locations", cookies.receptionist);
      assert.doesNotMatch(locations.text, /NEXT_HTTP_ERROR_FALLBACK;403/);
    });

    await t.test("Staff HTML and RSC are self-only and omit every management URL", async () => {
      for (const rsc of [false, true]) {
        const overview = await body("/business", cookies.staff, rsc);
        assert.equal(overview.response.status, 200);
        assert.match(overview.text, /STAGE2D-HTTP-SERVICE/);
        assert.match(overview.text, new RegExp(`/business/team/${fixture.staff.membership.id}/availability`));
        for (const sentinel of [
          "STAGE2D-HTTP-CUSTOMER-PII-SENTINEL",
          "STAGE2D-HTTP-NOTES-SENTINEL",
          fixture.manager.membership.id,
          "/business/analytics",
          "/business/manage",
          "/business/public-profile",
          "/business/manage/audit",
        ]) {
          assert.equal(overview.text.includes(sentinel), false, sentinel);
        }
      }
      for (const path of [
        "/business/analytics",
        "/business/manage",
        "/business/public-profile",
        "/business/manage/audit",
        "/business/manage/locations",
        "/business/reviews",
      ]) {
        assertForbidden((await body(path, cookies.staff)).text);
      }
      const selfAvailability = await body(
        `/business/team/${fixture.staff.membership.id}/availability`,
        cookies.staff,
      );
      assert.doesNotMatch(selfAvailability.text, /NEXT_HTTP_ERROR_FALLBACK;403/);
    });

    await t.test("Generic vertical direct Restaurant routes fail safely", async () => {
      for (const path of ["/business/reservations", "/business/tables", "/business/menu"]) {
        const result = await body(path, cookies.owner);
        assert.match(result.text, /NEXT_HTTP_ERROR_FALLBACK;404/);
      }
      for (const path of Object.keys(deferredBusinessRouteRegistry)) {
        const result = await body(path, cookies.owner);
        assert.match(
          result.text,
          /NEXT_HTTP_ERROR_FALLBACK;404/,
          `${path} must remain unavailable until its owning stage`,
        );
      }
      const malformed = await body("/business/analytics?period=999", cookies.owner);
      assert.match(malformed.text, /NEXT_HTTP_ERROR_FALLBACK;404/);
    });
  },
);
