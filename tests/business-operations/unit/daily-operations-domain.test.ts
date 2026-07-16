import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOperationalBookingTransition,
  availableOperationalBookingTransitions,
  businessCalendarCursorWhere,
  businessCalendarOrder,
  calendarScopeForRole,
  decodeBusinessCalendarCursor,
  encodeBusinessCalendarCursor,
  operationalCancellationReasonSchema,
  operationalMenuCategorySchema,
  operationalMenuItemSchema,
  operationalRestaurantRescheduleSchema,
  operationalRestaurantTableCreateSchema,
  operationalRestaurantTableUpdateSchema,
  safeOperationalActivity,
} from "../../../features/business-operations/domain/daily-operations";
import { BusinessOperationsError } from "../../../features/business-operations/domain/errors";
import {
  businessOperationCapabilities,
  canPerformBusinessOperation,
} from "../../../features/business-operations/domain/policy";
import {
  hashBusinessOperation,
  sanitizeAuditValue,
} from "../../../features/business-operations/domain/validation";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bookingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const filters = {
  branchId: "",
  memberId: "",
  serviceId: "",
  status: "all" as const,
  type: "all" as const,
};
const binding = {
  filters,
  organizationId,
  role: "OWNER" as const,
  scope: "MANAGEMENT" as const,
  selectedDate: "2026-07-20",
  view: "upcoming" as const,
};

test("Stage 2C role capability matrix is explicit and fails closed", () => {
  const bookingOperations = [
    "BOOKING_READ",
    "BOOKING_OPERATE",
    "BOOKING_CANCEL",
    "BOOKING_COMPLETE",
    "BOOKING_NO_SHOW",
    "BOOKING_CHANGE_REQUEST_READ",
    "BOOKING_CHANGE_REQUEST_RESPOND",
    "BOOKING_CHANGE_PROPOSE",
    "RESTAURANT_RESERVATION_OPERATE",
  ] as const;
  for (const capability of bookingOperations) {
    assert.equal(canPerformBusinessOperation("OWNER", capability), true);
    assert.equal(canPerformBusinessOperation("MANAGER", capability), true);
    assert.equal(canPerformBusinessOperation("RECEPTIONIST", capability), true);
    assert.equal(
      canPerformBusinessOperation("STAFF", capability),
      capability === "BOOKING_READ",
    );
  }
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "RESTAURANT_TABLE_READ"), true);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "RESTAURANT_TABLE_WRITE"), false);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "RESTAURANT_MENU_READ"), true);
  assert.equal(canPerformBusinessOperation("RECEPTIONIST", "RESTAURANT_MENU_WRITE"), false);
  assert.equal(canPerformBusinessOperation("STAFF", "RESTAURANT_MENU_READ"), false);
  assert.equal(businessOperationCapabilities(null).size, 0);
});

test("calendar scope and ordering are role-specific and deterministic", () => {
  assert.equal(calendarScopeForRole("OWNER"), "MANAGEMENT");
  assert.equal(calendarScopeForRole("MANAGER"), "MANAGEMENT");
  assert.equal(calendarScopeForRole("RECEPTIONIST"), "RECEPTIONIST");
  assert.equal(calendarScopeForRole("STAFF"), "STAFF_SELF");
  assert.deepEqual(businessCalendarOrder("today"), [{ startsAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(businessCalendarOrder("upcoming"), [{ startsAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(businessCalendarOrder("past"), [{ startsAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(businessCalendarOrder("cancelled"), [{ startsAt: "desc" }, { id: "desc" }]);
});

test("calendar cursors round-trip and bind snapshot, tenant, role, scope, view, date and filters", () => {
  const cursor = encodeBusinessCalendarCursor({
    ...binding,
    id: bookingId,
    snapshotAt: "2026-07-16T10:00:00.000Z",
    startsAt: "2026-07-20T10:00:00.000Z",
  });
  assert.deepEqual(decodeBusinessCalendarCursor(cursor, binding), {
    ...binding,
    id: bookingId,
    snapshotAt: "2026-07-16T10:00:00.000Z",
    startsAt: "2026-07-20T10:00:00.000Z",
    version: 1,
  });
  for (const changed of [
    { ...binding, organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    { ...binding, role: "MANAGER" as const },
    { ...binding, selectedDate: "2026-07-21" },
    { ...binding, view: "today" as const },
    { ...binding, filters: { ...filters, type: "restaurant" as const } },
  ]) {
    assert.throws(
      () => decodeBusinessCalendarCursor(cursor, changed),
      (error) => error instanceof BusinessOperationsError && error.code === "INVALID_REQUEST",
    );
  }
  assert.throws(
    () => decodeBusinessCalendarCursor("malformed", binding),
    (error) => error instanceof BusinessOperationsError && error.code === "INVALID_REQUEST",
  );
});

test("calendar cursor predicates use tuple-safe continuation in both directions", () => {
  const ascending = businessCalendarCursorWhere("upcoming", {
    id: bookingId,
    startsAt: "2026-07-20T10:00:00.000Z",
  });
  const descending = businessCalendarCursorWhere("past", {
    id: bookingId,
    startsAt: "2026-07-20T10:00:00.000Z",
  });
  assert.deepEqual((ascending.OR as Array<Record<string, unknown>>)[0], {
    startsAt: { gt: new Date("2026-07-20T10:00:00.000Z") },
  });
  assert.deepEqual((descending.OR as Array<Record<string, unknown>>)[0], {
    startsAt: { lt: new Date("2026-07-20T10:00:00.000Z") },
  });
});

test("canonical lifecycle and timing rules prevent reopening, future completion/no-show and expired confirmation", () => {
  const now = new Date("2026-07-20T10:00:00.000Z");
  const future = new Date("2026-07-20T11:00:00.000Z");
  const past = new Date("2026-07-20T09:00:00.000Z");
  assert.deepEqual(availableOperationalBookingTransitions({ startsAt: future, status: "PENDING" }, now), ["CONFIRMED", "CANCELLED"]);
  assert.deepEqual(availableOperationalBookingTransitions({ startsAt: past, status: "PENDING" }, now), ["CANCELLED"]);
  assert.deepEqual(availableOperationalBookingTransitions({ startsAt: future, status: "CONFIRMED" }, now), ["CANCELLED"]);
  assert.deepEqual(availableOperationalBookingTransitions({ startsAt: past, status: "CONFIRMED" }, now), ["CANCELLED", "COMPLETED", "NO_SHOW"]);
  for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
    assert.deepEqual(availableOperationalBookingTransitions({ startsAt: past, status }, now), []);
    assert.throws(
      () => assertOperationalBookingTransition({ startsAt: past, status }, "CONFIRMED", now),
      (error) => error instanceof BusinessOperationsError && error.code === "BOOKING_STATE_CONFLICT",
    );
  }
  for (const status of ["COMPLETED", "NO_SHOW"] as const) {
    assert.throws(
      () => assertOperationalBookingTransition({ startsAt: future, status: "CONFIRMED" }, status, now),
      (error) => error instanceof BusinessOperationsError && error.code === "BOOKING_STATE_CONFLICT",
    );
  }
});

test("customer-visible cancellation reason trims and enforces a 1-500 character bound", () => {
  assert.equal(operationalCancellationReasonSchema.parse("  scheduling issue  "), "scheduling issue");
  assert.equal(operationalCancellationReasonSchema.safeParse("").success, false);
  assert.equal(operationalCancellationReasonSchema.safeParse("x".repeat(500)).success, true);
  assert.equal(operationalCancellationReasonSchema.safeParse("x".repeat(501)).success, false);
});

test("safe activity mapping exposes only canonical status and same-status event types", () => {
  assert.equal(safeOperationalActivity({ fromStatus: "PENDING", note: "private", toStatus: "CONFIRMED" }), "STATUS_CONFIRMED");
  assert.equal(safeOperationalActivity({ fromStatus: "CONFIRMED", note: "GENERIC_CHANGE_ACCEPTED", toStatus: "CONFIRMED" }), "GENERIC_CHANGE_ACCEPTED");
  assert.equal(safeOperationalActivity({ fromStatus: "CONFIRMED", note: "private internal note", toStatus: "CONFIRMED" }), null);
});

test("Restaurant table create and update schemas keep Branch immutable and capacity bounded", () => {
  const table = { area: "Main", branchId: organizationId, capacity: 4, code: "T4", floor: "1", name: "Table 4", positionLabel: "Window" };
  assert.equal(operationalRestaurantTableCreateSchema.safeParse(table).success, true);
  assert.equal(operationalRestaurantTableCreateSchema.safeParse({ ...table, branchId: "invalid" }).success, false);
  const update = { area: table.area, capacity: table.capacity, code: table.code, floor: table.floor, name: table.name, positionLabel: table.positionLabel };
  assert.equal(operationalRestaurantTableUpdateSchema.safeParse(update).success, true);
  assert.equal(operationalRestaurantTableUpdateSchema.safeParse({ ...update, branchId: organizationId }).success, false);
  assert.equal(operationalRestaurantTableUpdateSchema.safeParse({ ...update, unknownBranch: organizationId }).success, false);
  assert.equal(operationalRestaurantTableUpdateSchema.safeParse({ ...update, capacity: 5 }).success, true);
  assert.equal(operationalRestaurantTableUpdateSchema.safeParse({ ...update, capacity: 3 }).success, true);
  assert.equal(operationalRestaurantTableCreateSchema.safeParse({ ...table, capacity: 0 }).success, false);
  assert.equal(operationalRestaurantTableCreateSchema.safeParse({ ...table, businessId: organizationId }).success, false);
});

test("Restaurant reschedule and menu category schemas are strict and bounded", () => {
  const reschedule = { customerNote: "Window", date: "2026-07-20", guestCount: 4, seatingArea: "Main", tableId: bookingId, time: "12:30" };
  assert.equal(operationalRestaurantRescheduleSchema.safeParse(reschedule).success, true);
  assert.equal(operationalRestaurantRescheduleSchema.safeParse({ ...reschedule, time: "12:15" }).success, true);
  assert.equal(operationalRestaurantRescheduleSchema.safeParse({ ...reschedule, guestCount: 101 }).success, false);
  assert.equal(operationalMenuCategorySchema.safeParse({ description: "Food", name: "Mains", sortOrder: 10 }).success, true);
  assert.equal(operationalMenuCategorySchema.safeParse({ description: "Food", name: "Mains", sortOrder: 10_001 }).success, false);
});

test("menu item price, currency, preparation, URL, mass assignment and normalization policies fail closed", () => {
  const item = { currency: "iqd", description: "Dish", imageUrl: "https://example.test/dish.jpg", menuCategoryId: organizationId, name: "Dish", preparationMinutes: 20, price: "25000.00", sortOrder: 1 };
  const parsed = operationalMenuItemSchema.parse(item);
  assert.equal(parsed.currency, "IQD");
  assert.equal(operationalMenuItemSchema.safeParse({ ...item, price: "99999999.99" }).success, true);
  for (const price of ["0", "-1", ".5", "1.234", "1e3", "NaN", "Infinity", "100000000", "999999999.99"]) {
    assert.equal(operationalMenuItemSchema.safeParse({ ...item, price }).success, false);
  }
  assert.equal(operationalMenuItemSchema.safeParse({ ...item, currency: "IQDD" }).success, false);
  assert.equal(operationalMenuItemSchema.safeParse({ ...item, preparationMinutes: 0 }).success, false);
  assert.equal(operationalMenuItemSchema.safeParse({ ...item, imageUrl: "javascript:alert(1)" }).success, false);
  assert.equal(operationalMenuItemSchema.safeParse({ ...item, businessId: organizationId }).success, false);
});

test("request hashes bind versions and mutation intent while audit sanitization removes secrets", () => {
  const first = hashBusinessOperation({ action: "BOOKING_STATUS_TRANSITION", bookingId, expectedVersion: "v1", nextStatus: "CANCELLED", reason: "closed" });
  const reordered = hashBusinessOperation({ nextStatus: "CANCELLED", reason: "closed", expectedVersion: "v1", bookingId, action: "BOOKING_STATUS_TRANSITION" });
  const changed = hashBusinessOperation({ action: "BOOKING_STATUS_TRANSITION", bookingId, expectedVersion: "v2", nextStatus: "CANCELLED", reason: "closed" });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  const sanitized = sanitizeAuditValue({ Authorization: "Bearer secret", customerName: "not required", nested: { cookie: "secret", DATABASE_URL: "secret", status: "CONFIRMED" } }) as Record<string, unknown>;
  assert.equal(sanitized.Authorization, undefined);
  assert.deepEqual(sanitized.nested, { status: "CONFIRMED" });
});
