import assert from "node:assert/strict";
import test from "node:test";

import {
  branchCompletedPeriodRange,
  branchHoursAreComplete,
  branchLocalDayRange,
  businessOverviewScope,
  businessQuickActions,
  canAccessStage2Route,
  deterministicTopN,
  parseBusinessAnalyticsPeriod,
  safeRate,
  STAGE2_ROUTE_POLICIES,
} from "../../../features/business-operations/domain/closure";
import {
  businessOperationCapabilities,
  canPerformBusinessOperation,
} from "../../../features/business-operations/domain/policy";
import { getDashboardNavigation } from "../../../features/dashboard/navigation";
import { businessNotificationWhere } from "../../../features/notifications/domain/business-notification-policy";
import { isSafePublicImageUrl } from "../../../lib/security/public-image-url";

test("Stage 2D closure domain keeps role scopes and routes fail-closed", () => {
  assert.equal(businessOverviewScope("OWNER"), "MANAGEMENT");
  assert.equal(businessOverviewScope("MANAGER"), "MANAGEMENT");
  assert.equal(businessOverviewScope("RECEPTIONIST"), "RECEPTIONIST");
  assert.equal(businessOverviewScope("STAFF"), "STAFF_SELF");

  assert.equal(canPerformBusinessOperation("OWNER", "BUSINESS_ANALYTICS_READ"), true);
  assert.equal(canPerformBusinessOperation("MANAGER", "BUSINESS_ANALYTICS_READ"), true);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "BUSINESS_ANALYTICS_READ"), false);
  assert.equal(canPerformBusinessOperation("STAFF", "BUSINESS_MANAGEMENT_HUB_READ"), false);
  assert.equal(canPerformBusinessOperation(null, "BUSINESS_OVERVIEW_READ"), false);
  assert.equal(businessOperationCapabilities("STAFF").has("BUSINESS_READINESS_READ"), false);

  assert.equal(canAccessStage2Route("OWNER", "BEAUTY", "/business/analytics"), true);
  assert.equal(canAccessStage2Route("RECEPTIONIST", "BEAUTY", "/business/analytics"), false);
  assert.equal(canAccessStage2Route("STAFF", "BEAUTY", "/business/manage"), false);
  assert.equal(canAccessStage2Route("OWNER", "BEAUTY", "/business/reservations"), false);
  assert.equal(canAccessStage2Route("OWNER", "RESTAURANT", "/business/services"), false);
  assert.equal(canAccessStage2Route("OWNER", "RESTAURANT", "/business/reservations"), true);
  assert.equal(canAccessStage2Route("STAFF", "RESTAURANT", "/business/reservations"), false);
  assert.equal(canAccessStage2Route("RECEPTIONIST", "BEAUTY", "/business/manage/locations/branch/hours"), true);
  assert.equal(canAccessStage2Route("STAFF", "BEAUTY", "/business/manage/locations/branch/hours"), false);
  assert.equal(canAccessStage2Route("OWNER", "BEAUTY", "/business/messages"), true);
  assert.equal(canAccessStage2Route("RECEPTIONIST", "BEAUTY", "/business/messages"), false);
  assert.equal(canAccessStage2Route("STAFF", "BEAUTY", "/business/notifications"), true);
  assert.equal(canAccessStage2Route("OWNER", "BEAUTY", "/business/not-a-stage2-route"), false);
  assert.equal(new Set(STAGE2_ROUTE_POLICIES.map((item) => item.path)).size, STAGE2_ROUTE_POLICIES.length);
});

test("Branch-local day ranges preserve independent timezones and completed periods", () => {
  const snapshot = new Date("2026-03-29T00:30:00.000Z");
  const baghdad = branchLocalDayRange(
    { id: "baghdad", timezone: "Asia/Baghdad" },
    snapshot,
  );
  const istanbul = branchLocalDayRange(
    { id: "istanbul", timezone: "Europe/Istanbul" },
    snapshot,
  );
  assert.equal(baghdad.localDate, "2026-03-29");
  assert.equal(istanbul.localDate, "2026-03-29");
  assert.equal(baghdad.start.toISOString(), "2026-03-28T21:00:00.000Z");
  assert.equal(istanbul.start.toISOString(), "2026-03-28T21:00:00.000Z");
  assert.equal(istanbul.end.toISOString(), "2026-03-29T21:00:00.000Z");

  const seven = branchCompletedPeriodRange(
    { id: "istanbul", timezone: "Europe/Istanbul" },
    snapshot,
    7,
  );
  assert.equal(seven.localDate, "2026-03-22");
  assert.equal(seven.end.toISOString(), istanbul.start.toISOString());

  const boundary = new Date("2026-07-15T22:30:00.000Z");
  assert.equal(
    branchLocalDayRange({ id: "baghdad", timezone: "Asia/Baghdad" }, boundary).localDate,
    "2026-07-16",
  );
  assert.equal(
    branchLocalDayRange({ id: "london", timezone: "Europe/London" }, boundary).localDate,
    "2026-07-15",
  );
});

test("Analytics parsing, rates, and top-N ordering are deterministic and zero-safe", () => {
  assert.equal(parseBusinessAnalyticsPeriod(undefined), "7");
  assert.equal(parseBusinessAnalyticsPeriod("30"), "30");
  assert.equal(parseBusinessAnalyticsPeriod("0"), null);
  assert.equal(parseBusinessAnalyticsPeriod("7 OR 1=1"), null);
  assert.equal(safeRate(0, 0), 0);
  assert.equal(safeRate(1, 3), 33.33);
  assert.deepEqual(
    deterministicTopN(
      [
        { id: "b", name: "Beta", count: 2 },
        { id: "c", name: "Alpha", count: 2 },
        { id: "a", name: "Alpha", count: 2 },
        { id: "d", name: "Delta", count: 1 },
      ],
      3,
    ).map((row) => row.id),
    ["a", "c", "b"],
  );
});

test("Readiness requires complete and valid seven-day hours", () => {
  const complete = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closeTime: "17:00",
    dayOfWeek,
    isOpen: dayOfWeek !== 5,
    openTime: "09:00",
  }));
  assert.equal(branchHoursAreComplete(complete), true);
  assert.equal(branchHoursAreComplete(complete.slice(0, 6)), false);
  assert.equal(
    branchHoursAreComplete(
      complete.map((row) =>
        row.dayOfWeek === 2 ? { ...row, closeTime: "08:00" } : row,
      ),
    ),
    false,
  );
});

test("Quick actions and navigation never serialize forbidden management hrefs", () => {
  const ownerActions = businessQuickActions({
    membershipId: "owner",
    role: "OWNER",
    vertical: "BEAUTY",
  });
  assert.ok(ownerActions.some((action) => action.href === "/business/manage/audit"));
  const managerActions = businessQuickActions({
    membershipId: "manager",
    role: "MANAGER",
    vertical: "BEAUTY",
  });
  assert.equal(managerActions.some((action) => action.key === "audit"), false);
  const receptionistActions = businessQuickActions({
    membershipId: "receptionist",
    role: "RECEPTIONIST",
    vertical: "RESTAURANT",
  });
  assert.deepEqual(
    receptionistActions.map((action) => action.key),
    ["calendar", "reservations", "tables", "menu"],
  );
  const staffActions = businessQuickActions({
    membershipId: "staff-id",
    role: "STAFF",
    vertical: "BEAUTY",
  });
  assert.deepEqual(staffActions.map((action) => action.key), ["calendar", "services", "availability"]);
  assert.ok(staffActions[2]?.href.includes("staff-id"));

  const hrefs = (role: "OWNER" | "MANAGER" | "RECEPTIONIST" | "STAFF") =>
    getDashboardNavigation("business", "BEAUTY", role, `${role}-id`, role !== "STAFF")
      .flatMap((group) => group.items)
      .flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);
  assert.ok(hrefs("OWNER").includes("/business/manage/audit"));
  assert.equal(hrefs("MANAGER").includes("/business/manage/audit"), false);
  for (const role of ["RECEPTIONIST", "STAFF"] as const) {
    assert.equal(hrefs(role).includes("/business/manage"), false);
    assert.equal(hrefs(role).includes("/business/analytics"), false);
    assert.equal(hrefs(role).includes("/business/public-profile"), false);
  }
  assert.equal(hrefs("STAFF").includes("/business/messages"), false);
  assert.equal(hrefs("RECEPTIONIST").includes("/business/services"), false);

  const restaurantManager = getDashboardNavigation(
    "business",
    "RESTAURANT",
    "MANAGER",
    "manager-id",
    true,
  ).flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
  assert.ok(restaurantManager.includes("/business/team"));
  assert.equal(restaurantManager.includes("/business/reviews"), false);
  const restaurantStaff = getDashboardNavigation(
    "business",
    "RESTAURANT",
    "STAFF",
    "restaurant-staff-id",
    false,
  ).flatMap((group) => group.items.map((item) => item.href));
  assert.ok(restaurantStaff.includes("/business/team/restaurant-staff-id/availability"));
  assert.equal(restaurantStaff.includes("/business/reservations"), false);
});

test("Business notification audiences are role-aware and Staff is personal-only", () => {
  const owner = JSON.stringify(
    businessNotificationWhere({
      organizationId: "organization",
      personId: "person",
      restaurant: true,
      role: "OWNER",
    }),
  );
  assert.match(owner, /BUSINESS_OWNERS/);
  assert.match(owner, /RESTAURANTS/);
  assert.match(owner, /BUSINESS/);

  const staff = JSON.stringify(
    businessNotificationWhere({
      organizationId: "organization",
      personId: "person",
      restaurant: true,
      role: "STAFF",
    }),
  );
  assert.match(staff, /"ALL"/);
  assert.match(staff, /"USER"/);
  assert.doesNotMatch(staff, /BUSINESS_OWNERS|RESTAURANTS|"BUSINESS"/);
});

test("Business-managed image URLs fail closed for non-HTTPS and private targets", () => {
  assert.equal(isSafePublicImageUrl("https://cdn.example.test/image.jpg"), true);
  assert.equal(isSafePublicImageUrl("http://cdn.example.test/image.jpg"), false);
  assert.equal(isSafePublicImageUrl("https://localhost/image.jpg"), false);
  assert.equal(isSafePublicImageUrl("https://127.0.0.1/image.jpg"), false);
  assert.equal(isSafePublicImageUrl("https://[::1]/image.jpg"), false);
  assert.equal(isSafePublicImageUrl("https://user:secret@cdn.example.test/image.jpg"), false);
  assert.equal(isSafePublicImageUrl("javascript:alert(1)"), false);
});
