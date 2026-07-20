import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canAssignRole,
  canInviteRole,
  canManageWorkforceRole,
  invitationExpiresAtIsAllowed,
  operationalInvitationSchema,
  operationalMemberBlockSchema,
  operationalMemberProfileSchema,
  operationalOfferingSchema,
  operationalServiceSchema,
  operationalStaffScheduleSchema,
} from "../../../features/business-operations/domain/services-workforce";
import {
  businessOperationCapabilities,
  canPerformBusinessOperation,
} from "../../../features/business-operations/domain/policy";
import { hashBusinessOperation, sanitizeAuditValue } from "../../../features/business-operations/domain/validation";
import { serviceStaffPolicyAllowsMember } from "../../../features/bookings/domain/staff-assignment-policy";

test("Stage 2B capability matrix is centralized and fails closed", () => {
  for (const capability of [
    "SERVICE_WRITE", "OFFERING_WRITE", "WORKFORCE_WRITE", "ROLE_WRITE",
    "BRANCH_ASSIGNMENT_WRITE", "SERVICE_ASSIGNMENT_WRITE", "STAFF_SCHEDULE_WRITE",
    "MEMBER_BLOCK_WRITE_ALL",
  ] as const) {
    assert.equal(canPerformBusinessOperation("OWNER", capability), true);
    assert.equal(canPerformBusinessOperation("MANAGER", capability), true);
    assert.equal(canPerformBusinessOperation("RECEPTIONIST", capability), false);
    assert.equal(canPerformBusinessOperation("STAFF", capability), false);
  }
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "WORKFORCE_READ"), true);
  assert.equal(canPerformBusinessOperation("STAFF", "MEMBER_BLOCK_WRITE_SELF"), true);
  assert.equal(canPerformBusinessOperation("STAFF", "STAFF_SCHEDULE_WRITE"), false);
  assert.equal(businessOperationCapabilities(null).size, 0);
});

test("inviter, workforce target, and role assignment matrices prevent escalation", () => {
  assert.equal(canInviteRole("OWNER", "MANAGER"), true);
  assert.equal(canInviteRole("MANAGER", "MANAGER"), false);
  assert.equal(canInviteRole("MANAGER", "RECEPTIONIST"), true);
  assert.equal(canInviteRole("MANAGER", "STAFF"), true);
  assert.equal(canInviteRole("OWNER", "OWNER"), false);
  assert.equal(canManageWorkforceRole("OWNER", "OWNER"), false);
  assert.equal(canManageWorkforceRole("MANAGER", "MANAGER"), false);
  assert.equal(canManageWorkforceRole("MANAGER", "STAFF"), true);
  assert.equal(canAssignRole("OWNER", "MANAGER", "STAFF"), true);
  assert.equal(canAssignRole("MANAGER", "STAFF", "MANAGER"), false);
});

test("Service input is normalized, bounded, allowlisted, and preserves canonical modes", () => {
  const categoryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const parsed = operationalServiceSchema.parse({
    categoryId,
    description: "  description  ",
    name: "  Hair service  ",
    staffSelectionMode: "OPTIONAL",
  });
  assert.equal(parsed.name, "Hair service");
  assert.equal(parsed.description, "description");
  assert.equal(operationalServiceSchema.safeParse({ ...parsed, imageUrl: "https://example.com/new.jpg" }).success, false);
  assert.equal(operationalServiceSchema.safeParse({ ...parsed, organizationId: categoryId }).success, false);
  assert.equal(operationalServiceSchema.safeParse({ ...parsed, staffSelectionMode: "AUTOMATIC" }).success, false);
});

test("Branch offering price and duration reject corruption and hash deterministically", () => {
  for (const price of ["1", "1.00", "99999999.99"]) {
    assert.equal(operationalOfferingSchema.safeParse({ durationMinutes: 30, price, pricingType: "FIXED" }).success, true);
  }
  for (const price of ["0", "-1", ".5", "1.234", "1e3", "NaN", "999999999.00", 10]) {
    assert.equal(operationalOfferingSchema.safeParse({ durationMinutes: 30, price, pricingType: "FIXED" }).success, false);
  }
  for (const durationMinutes of [0, -5, 5.5, 1441, Number.NaN, "30"]) {
    assert.equal(operationalOfferingSchema.safeParse({ durationMinutes, price: "10.00", pricingType: "FIXED" }).success, false);
  }
  const first = hashBusinessOperation({ action: "OFFERING_UPDATE", offering: { durationMinutes: 30, price: "10.00" } });
  const replay = hashBusinessOperation({ offering: { price: "10.00", durationMinutes: 30 }, action: "OFFERING_UPDATE" });
  const changed = hashBusinessOperation({ action: "OFFERING_UPDATE", offering: { durationMinutes: 45, price: "10.00" } });
  assert.equal(first, replay);
  assert.notEqual(first, changed);
});

test("invitation identity, expiration, and token-independent request policy are bounded", () => {
  const now = new Date("2026-07-16T10:00:00.000Z");
  assert.equal(invitationExpiresAtIsAllowed(new Date("2026-07-16T11:00:00.000Z"), now), true);
  assert.equal(invitationExpiresAtIsAllowed(new Date("2026-08-15T10:00:00.000Z"), now), true);
  assert.equal(invitationExpiresAtIsAllowed(new Date("2026-07-16T10:59:59.999Z"), now), false);
  assert.equal(invitationExpiresAtIsAllowed(new Date("2026-08-15T10:00:00.001Z"), now), false);
  assert.equal(operationalInvitationSchema.safeParse({ email: "member@example.test", expiresAt: "2026-07-20T10:00:00.000Z", systemRole: "STAFF" }).success, true);
  assert.equal(operationalInvitationSchema.safeParse({ email: "member@example.test", expiresAt: "2026-07-20", systemRole: "OWNER" }).success, false);
});

test("weekly schedule requires seven canonical unique days and member leave is strict", () => {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({ closeTime: "17:00", dayOfWeek, isOpen: dayOfWeek !== 5, openTime: "09:00" }));
  assert.equal(operationalStaffScheduleSchema.safeParse({ days }).success, true);
  assert.equal(operationalStaffScheduleSchema.safeParse({ days: days.slice(0, 6) }).success, false);
  assert.equal(operationalStaffScheduleSchema.safeParse({ days: days.map((day) => ({ ...day, dayOfWeek: 1 })) }).success, false);
  assert.equal(operationalStaffScheduleSchema.safeParse({ days: days.map((day) => day.dayOfWeek === 1 ? { ...day, openTime: "18:00" } : day) }).success, false);
  assert.equal(operationalMemberBlockSchema.safeParse({ branchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", startsAt: "2026-07-20T10:00", endsAt: "2026-07-20T12:00", reason: "Private" }).success, true);
  assert.equal(operationalMemberBlockSchema.safeParse({ branchId: "foreign", startsAt: "2026-07-20 10:00", endsAt: "2026-07-20T12:00", reason: "Private" }).success, false);
});

test("workforce profile normalization and public slug policy fail closed", () => {
  assert.equal(operationalMemberProfileSchema.safeParse({ bio: "", isPublicProfessional: false, publicSlug: null, specialties: ["Cut", "Cut"] }).success, true);
  assert.equal(operationalMemberProfileSchema.safeParse({ bio: "", isPublicProfessional: true, publicSlug: null, specialties: [] }).success, false);
  assert.equal(operationalMemberProfileSchema.safeParse({ bio: "", isPublicProfessional: true, publicSlug: "Bad Slug", specialties: [] }).success, false);
  assert.equal(operationalMemberProfileSchema.safeParse({ bio: "", isPublicProfessional: false, photoUrl: "https://example.com/new.jpg", publicSlug: null, specialties: [] }).success, false);
});

test("explicit Service staff assignment never falls back to every Branch employee", () => {
  const assigned = new Set(["assigned"]);
  assert.equal(serviceStaffPolicyAllowsMember(assigned, "assigned"), true);
  assert.equal(serviceStaffPolicyAllowsMember(assigned, "other"), false);
  assert.equal(serviceStaffPolicyAllowsMember(new Set(), "other"), false);
});

test("Stage 2B audit payload sanitization removes invitation secrets and personal auth material", () => {
  const sanitized = sanitizeAuditValue({
    email: "not-needed@example.test",
    idempotencyKey: "safe",
    invitationToken: "secret",
    nested: { cookie: "secret", password: "secret", role: "STAFF" },
  }) as Record<string, unknown>;
  assert.equal(sanitized.invitationToken, undefined);
  assert.deepEqual(sanitized.nested, { role: "STAFF" });
});

test("migration 30 is forward-only and adds only required lifecycle/version fields", async () => {
  const migration = await readFile(new URL("../../../prisma/migrations/20260716010000_business_services_workforce/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'ARCHIVED'/);
  assert.match(migration, /ADD COLUMN "deletedAt" TIMESTAMPTZ\(6\)/);
  assert.match(migration, /BranchService/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|migrate reset/i);
});
