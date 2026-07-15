import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeOperationalSchedule } from "../../../features/business-operations/domain/hours";
import {
  branchArchiveConflicts,
  intervalsOverlap,
  requiresReservationImpactConfirmation,
} from "../../../features/business-operations/domain/lifecycle";
import {
  businessOperationCapabilities,
  canPerformBusinessOperation,
} from "../../../features/business-operations/domain/policy";
import {
  blockLocalInputSchema,
  hashBusinessOperation,
  isValidIanaTimezone,
  operationalBranchSchema,
  operationalHoursSchema,
  operationalSettingsSchema,
  sanitizeAuditValue,
} from "../../../features/business-operations/domain/validation";

test("business operations role matrix fails closed", () => {
  assert.equal(canPerformBusinessOperation("OWNER", "AUDIT_READ"), true);
  assert.equal(canPerformBusinessOperation("OWNER", "BRANCH_ARCHIVE"), true);
  assert.equal(canPerformBusinessOperation("MANAGER", "BRANCH_ARCHIVE"), false);
  assert.equal(canPerformBusinessOperation("MANAGER", "SETTINGS_WRITE"), true);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "BLOCK_WRITE"), true);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "HOURS_WRITE"), false);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "SETTINGS_READ"), false);
  assert.deepEqual([...businessOperationCapabilities("STAFF")].sort(), [
    "MEMBER_BLOCK_READ",
    "MEMBER_BLOCK_WRITE_SELF",
    "OFFERING_READ",
    "SERVICE_READ",
    "STAFF_SCHEDULE_READ",
    "WORKFORCE_READ",
  ].sort());
  assert.deepEqual([...businessOperationCapabilities(null)], []);
});

test("settings validation is strict, integral, and bounded", () => {
  assert.equal(operationalSettingsSchema.safeParse({
    bookingEnabled: true,
    cancellationWindowHours: 24,
    marketplaceVisible: true,
  }).success, true);
  for (const cancellationWindowHours of [-1, 1.5, 721, Number.NaN, "24"]) {
    assert.equal(operationalSettingsSchema.safeParse({
      bookingEnabled: true,
      cancellationWindowHours,
      marketplaceVisible: true,
    }).success, false);
  }
  assert.equal(operationalSettingsSchema.safeParse({
    bookingEnabled: true,
    cancellationWindowHours: 24,
    marketplaceVisible: true,
    allowOnlinePayments: true,
  }).success, false);
});

test("branch input normalizes bounded text and validates IANA timezones", () => {
  const parsed = operationalBranchSchema.parse({
    addressLine1: "  Main Street  ",
    addressLine2: null,
    city: "  Baghdad ",
    country: "Iraq",
    email: " qa@example.test ",
    latitude: 33.3152,
    locationInstructions: null,
    locationLabel: null,
    longitude: 44.3661,
    name: "  Main Branch  ",
    nearbyLandmark: null,
    phone: "+964 750 000 0000",
    timezone: "Asia/Baghdad",
  });
  assert.equal(parsed.name, "Main Branch");
  assert.equal(parsed.city, "Baghdad");
  assert.equal(parsed.email, "qa@example.test");
  assert.equal(isValidIanaTimezone("Asia/Baghdad"), true);
  assert.equal(isValidIanaTimezone("Mars/Olympus"), false);
  assert.equal(operationalBranchSchema.safeParse({ ...parsed, longitude: null }).success, false);
});

test("working hours require exactly seven unique canonical non-overnight days", () => {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closeTime: "17:00",
    dayOfWeek,
    isOpen: true,
    openTime: "09:00",
  }));
  assert.equal(operationalHoursSchema.safeParse({ days }).success, true);
  assert.equal(operationalHoursSchema.safeParse({ days: days.map((day) => ({ ...day, dayOfWeek: 0 })) }).success, false);
  assert.equal(operationalHoursSchema.safeParse({ days: days.slice(0, 6) }).success, false);
  assert.equal(operationalHoursSchema.safeParse({ days: days.map((day, index) => index === 2 ? { ...day, openTime: "18:00" } : day) }).success, false);
  assert.equal(operationalHoursSchema.safeParse({ days: days.map((day, index) => index === 2 ? { ...day, openTime: "9:00" } : day) }).success, false);
  const normalized = normalizeOperationalSchedule([days[3]!]);
  assert.equal(normalized.length, 7);
  assert.equal(normalized[3]?.isOpen, true);
  assert.equal(normalized[2]?.isOpen, false);
});

test("blocked time input, duration primitives, overlap, and impact policy are deterministic", () => {
  assert.equal(blockLocalInputSchema.safeParse({
    endsAt: "2026-08-01T12:00",
    reason: "Internal",
    startsAt: "2026-08-01T10:00",
  }).success, true);
  assert.equal(blockLocalInputSchema.safeParse({
    endsAt: "2026-08-01 12:00",
    reason: null,
    startsAt: "2026-08-01T10:00",
  }).success, false);
  const first = { startsAt: new Date("2026-08-01T10:00:00Z"), endsAt: new Date("2026-08-01T12:00:00Z") };
  assert.equal(intervalsOverlap(first, { startsAt: new Date("2026-08-01T11:59:00Z"), endsAt: new Date("2026-08-01T13:00:00Z") }), true);
  assert.equal(intervalsOverlap(first, { startsAt: new Date("2026-08-01T12:00:00Z"), endsAt: new Date("2026-08-01T13:00:00Z") }), false);
  assert.equal(requiresReservationImpactConfirmation({ total: 0 }), false);
  assert.equal(requiresReservationImpactConfirmation({ total: 1 }), true);
});

test("branch archival prerequisites enumerate every active relationship", () => {
  assert.deepEqual(branchArchiveConflicts({
    activeAssignments: 0,
    activeOfferings: 0,
    activeTables: 0,
    genericBookings: 0,
    restaurantReservations: 0,
    total: 0,
  }), []);
  assert.deepEqual(branchArchiveConflicts({
    activeAssignments: 1,
    activeOfferings: 2,
    activeTables: 0,
    genericBookings: 1,
    restaurantReservations: 1,
    total: 2,
  }).sort(), ["activeAssignments", "activeOfferings", "genericBookings", "restaurantReservations", "total"].sort());
});

test("canonical operation hashing is order-independent and payload-sensitive", () => {
  const first = hashBusinessOperation({ action: "SETTINGS_UPDATE", settings: { bookingEnabled: false, marketplaceVisible: true } });
  const reordered = hashBusinessOperation({ settings: { marketplaceVisible: true, bookingEnabled: false }, action: "SETTINGS_UPDATE" });
  const changed = hashBusinessOperation({ action: "SETTINGS_UPDATE", settings: { bookingEnabled: true, marketplaceVisible: true } });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("audit sanitization recursively removes secrets and bounds strings", () => {
  const sanitized = sanitizeAuditValue({
    bookingEnabled: false,
    cookie: "secret-cookie",
    nested: { DATABASE_URL: "secret-database", note: "x".repeat(800), sessionToken: "secret-token" },
  }) as Record<string, unknown>;
  assert.equal(sanitized.cookie, undefined);
  assert.equal((sanitized.nested as Record<string, unknown>).DATABASE_URL, undefined);
  assert.equal((sanitized.nested as Record<string, unknown>).sessionToken, undefined);
  assert.equal(((sanitized.nested as Record<string, unknown>).note as string).length, 500);
  assert.equal(sanitized.bookingEnabled, false);
});

test("public marketplace serialization cannot expose internal block reasons", async () => {
  const [service, component, types] = await Promise.all([
    readFile(new URL("../../../features/marketplace/services/marketplace.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/marketplace/components/public-business-profile-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/marketplace/types.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(service, /specialClosures:[\s\S]{0,500}reason:/);
  assert.doesNotMatch(component, /closure\.reason/);
  assert.doesNotMatch(types, /specialClosures: Array<\{[^}]*reason/);
});
