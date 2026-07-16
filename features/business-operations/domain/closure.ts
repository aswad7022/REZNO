import { TZDate } from "@date-fns/tz";
import type { BusinessVertical, SystemRole } from "@prisma/client";
import { z } from "zod";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import {
  canPerformBusinessOperation,
  type BusinessOperationCapability,
} from "@/features/business-operations/domain/policy";
import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";

export const ACTIVE_OPERATIONAL_BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
] as const;

export type BusinessOverviewScope =
  | "MANAGEMENT"
  | "RECEPTIONIST"
  | "STAFF_SELF";

export type BusinessQuickActionKey =
  | "analytics"
  | "audit"
  | "availability"
  | "bookings"
  | "calendar"
  | "locations"
  | "menu"
  | "publicProfile"
  | "reservations"
  | "services"
  | "settings"
  | "tables"
  | "team";

export interface BusinessQuickAction {
  href: string;
  key: BusinessQuickActionKey;
}

export interface BranchTimeZoneReference {
  id: string;
  timezone: string;
}

export interface BranchUtcRange extends BranchTimeZoneReference {
  end: Date;
  localDate: string;
  start: Date;
}

export interface Stage2RoutePolicy {
  authority: BusinessOperationCapability | "ACTIVE_MEMBERSHIP" | "IDENTITY_MESSAGING";
  path: string;
  scope:
    | "active-membership"
    | "management"
    | "notification-audience"
    | "role-scoped"
    | "self";
  vertical: "any" | "generic" | "restaurant";
}

const periodSchema = z.enum(["7", "30"]);
const businessTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type BusinessAnalyticsPeriod = z.infer<typeof periodSchema>;

export function parseBusinessAnalyticsPeriod(value: string | undefined) {
  const parsed = periodSchema.safeParse(value ?? "7");
  return parsed.success ? parsed.data : null;
}

export function branchHoursAreComplete(
  hours: Array<{
    closeTime: string;
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string;
  }>,
) {
  if (hours.length !== 7 || new Set(hours.map((hour) => hour.dayOfWeek)).size !== 7) {
    return false;
  }
  return hours.every(
    (hour) =>
      hour.dayOfWeek >= 0 &&
      hour.dayOfWeek <= 6 &&
      (!hour.isOpen ||
        (businessTimePattern.test(hour.openTime) &&
          businessTimePattern.test(hour.closeTime) &&
          hour.openTime < hour.closeTime)),
  );
}

export function businessOverviewScope(role: SystemRole): BusinessOverviewScope {
  if (role === "STAFF") return "STAFF_SELF";
  if (role === "RECEPTIONIST") return "RECEPTIONIST";
  return "MANAGEMENT";
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value ?? "0");
  return {
    day: part("day"),
    month: part("month"),
    year: part("year"),
  };
}

function shiftCalendarDate(
  value: { day: number; month: number; year: number },
  days: number,
) {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
}

function isoCalendarDate(value: { day: number; month: number; year: number }) {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function zonedStartOfDay(
  value: { day: number; month: number; year: number },
  timezone: string,
) {
  return new Date(
    new TZDate(value.year, value.month - 1, value.day, 0, 0, 0, timezone),
  );
}

export function branchLocalDayRange(
  branch: BranchTimeZoneReference,
  snapshotAt: Date,
  offsetDays = 0,
): BranchUtcRange {
  const localToday = localDateParts(snapshotAt, branch.timezone);
  const localDate = shiftCalendarDate(localToday, offsetDays);
  const nextDate = shiftCalendarDate(localDate, 1);
  return {
    ...branch,
    end: zonedStartOfDay(nextDate, branch.timezone),
    localDate: isoCalendarDate(localDate),
    start: zonedStartOfDay(localDate, branch.timezone),
  };
}

export function branchCompletedPeriodRange(
  branch: BranchTimeZoneReference,
  snapshotAt: Date,
  days: number,
): BranchUtcRange {
  const localToday = localDateParts(snapshotAt, branch.timezone);
  const startDate = shiftCalendarDate(localToday, -days);
  return {
    ...branch,
    end: zonedStartOfDay(localToday, branch.timezone),
    localDate: isoCalendarDate(startDate),
    start: zonedStartOfDay(startDate, branch.timezone),
  };
}

export function branchRangeWhere(ranges: readonly BranchUtcRange[]) {
  return ranges.map((range) => ({
    branchId: range.id,
    startsAt: { gte: range.start, lt: range.end },
  }));
}

export function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function deterministicTopN<T extends { count: number; id: string; name: string }>(
  rows: readonly T[],
  take: number,
) {
  return [...rows]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, take);
}

export function businessQuickActions(input: {
  membershipId: string;
  role: SystemRole;
  vertical: BusinessVertical;
}): BusinessQuickAction[] {
  const restaurant = isRestaurantVertical(input.vertical);
  if (input.role === "STAFF") {
    return [
      { href: "/business/calendar", key: "calendar" },
      ...(!restaurant
        ? ([{ href: "/business/services", key: "services" }] as const)
        : []),
      {
        href: `/business/team/${input.membershipId}/availability`,
        key: "availability",
      },
    ];
  }
  if (input.role === "RECEPTIONIST") {
    return [
      { href: "/business/calendar", key: "calendar" },
      restaurant
        ? { href: "/business/reservations", key: "reservations" }
        : { href: "/business/bookings", key: "bookings" },
      ...(restaurant
        ? ([
            { href: "/business/tables", key: "tables" },
            { href: "/business/menu", key: "menu" },
          ] as const)
        : []),
    ];
  }

  return [
    { href: "/business/calendar", key: "calendar" },
    { href: "/business/manage/settings", key: "settings" },
    { href: "/business/manage/locations", key: "locations" },
    ...(restaurant
      ? ([
          { href: "/business/tables", key: "tables" },
          { href: "/business/menu", key: "menu" },
          { href: "/business/team", key: "team" },
        ] as const)
      : ([
          { href: "/business/services", key: "services" },
          { href: "/business/team", key: "team" },
        ] as const)),
    { href: "/business/analytics", key: "analytics" },
    { href: "/business/public-profile", key: "publicProfile" },
    ...(input.role === "OWNER"
      ? ([{ href: "/business/manage/audit", key: "audit" }] as const)
      : []),
  ];
}

export const STAGE2_ROUTE_POLICIES = [
  { path: "/business", authority: "BUSINESS_OVERVIEW_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/calendar", authority: "BOOKING_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/bookings", authority: "BOOKING_READ", scope: "role-scoped", vertical: "generic" },
  { path: "/business/bookings/:bookingId", authority: "BOOKING_READ", scope: "role-scoped", vertical: "generic" },
  { path: "/business/bookings/:bookingId/reschedule", authority: "BOOKING_CHANGE_PROPOSE", scope: "role-scoped", vertical: "generic" },
  { path: "/business/reservations", authority: "RESTAURANT_RESERVATION_OPERATE", scope: "role-scoped", vertical: "restaurant" },
  { path: "/business/reservations/:bookingId", authority: "RESTAURANT_RESERVATION_OPERATE", scope: "role-scoped", vertical: "restaurant" },
  { path: "/business/services", authority: "SERVICE_READ", scope: "role-scoped", vertical: "generic" },
  { path: "/business/team", authority: "WORKFORCE_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/team/:memberId/availability", authority: "STAFF_SCHEDULE_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/manage", authority: "BUSINESS_MANAGEMENT_HUB_READ", scope: "management", vertical: "any" },
  { path: "/business/manage/settings", authority: "SETTINGS_READ", scope: "management", vertical: "any" },
  { path: "/business/manage/locations", authority: "BRANCH_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/manage/locations/:branchId/hours", authority: "HOURS_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/manage/locations/:branchId/blocks", authority: "BLOCK_READ", scope: "role-scoped", vertical: "any" },
  { path: "/business/manage/audit", authority: "AUDIT_READ", scope: "management", vertical: "any" },
  { path: "/business/public-profile", authority: "SETTINGS_READ", scope: "management", vertical: "any" },
  { path: "/business/tables", authority: "RESTAURANT_TABLE_READ", scope: "role-scoped", vertical: "restaurant" },
  { path: "/business/menu", authority: "RESTAURANT_MENU_READ", scope: "role-scoped", vertical: "restaurant" },
  { path: "/business/analytics", authority: "BUSINESS_ANALYTICS_READ", scope: "management", vertical: "any" },
  { path: "/business/reviews", authority: "SETTINGS_READ", scope: "management", vertical: "generic" },
  { path: "/business/messages", authority: "IDENTITY_MESSAGING", scope: "management", vertical: "any" },
  { path: "/business/notifications", authority: "ACTIVE_MEMBERSHIP", scope: "notification-audience", vertical: "any" },
  { path: "/business/profile", authority: "ACTIVE_MEMBERSHIP", scope: "self", vertical: "any" },
  { path: "/select-business", authority: "ACTIVE_MEMBERSHIP", scope: "active-membership", vertical: "any" },
] as const satisfies readonly Stage2RoutePolicy[];

function routeMatches(pattern: string, path: string) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  return expected.length === actual.length && expected.every(
    (segment, index) => segment.startsWith(":") || segment === actual[index],
  );
}

export function canAccessStage2Route(
  role: SystemRole,
  vertical: BusinessVertical,
  path: string,
) {
  const policy = STAGE2_ROUTE_POLICIES.find((item) => routeMatches(item.path, path));
  if (!policy) return false;
  if (
    policy.authority === "IDENTITY_MESSAGING"
      ? !canAccessOrganizationConversations(role)
      : policy.authority !== "ACTIVE_MEMBERSHIP" &&
        !canPerformBusinessOperation(role, policy.authority)
  ) {
    return false;
  }
  const restaurant = isRestaurantVertical(vertical);
  if (policy.vertical === "restaurant" && !restaurant) return false;
  if (policy.vertical === "generic" && restaurant) return false;
  return true;
}
