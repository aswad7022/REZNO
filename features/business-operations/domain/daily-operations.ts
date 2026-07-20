import type { BookingStatus, Prisma, SystemRole } from "@prisma/client";
import { z } from "zod";

import { businessOperationsError } from "@/features/business-operations/domain/errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BUSINESS_CALENDAR_VIEWS = [
  "today",
  "upcoming",
  "past",
  "cancelled",
] as const;
export const BUSINESS_CALENDAR_TYPES = ["all", "service", "restaurant"] as const;
export const BUSINESS_CALENDAR_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const satisfies readonly BookingStatus[];

export type BusinessCalendarView = (typeof BUSINESS_CALENDAR_VIEWS)[number];
export type BusinessCalendarType = (typeof BUSINESS_CALENDAR_TYPES)[number];
export type BusinessCalendarScope = "MANAGEMENT" | "RECEPTIONIST" | "STAFF_SELF";

export interface BusinessCalendarFilters {
  branchId: string;
  memberId: string;
  serviceId: string;
  status: BookingStatus | "all";
  type: BusinessCalendarType;
}

export interface BusinessCalendarCursorBinding {
  organizationId: string;
  role: SystemRole;
  scope: BusinessCalendarScope;
  selectedDate: string;
  view: BusinessCalendarView;
  filters: BusinessCalendarFilters;
}

interface BusinessCalendarCursor extends BusinessCalendarCursorBinding {
  version: 1;
  startsAt: string;
  id: string;
  snapshotAt: string;
}

export const DEFAULT_BUSINESS_CALENDAR_PAGE_SIZE = 20;
export const MAX_BUSINESS_CALENDAR_PAGE_SIZE = 50;

function sameFilters(left: BusinessCalendarFilters, right: BusinessCalendarFilters) {
  return left.branchId === right.branchId &&
    left.memberId === right.memberId &&
    left.serviceId === right.serviceId &&
    left.status === right.status &&
    left.type === right.type;
}

export function encodeBusinessCalendarCursor(
  value: Omit<BusinessCalendarCursor, "version">,
) {
  return Buffer.from(JSON.stringify({ version: 1, ...value }), "utf8").toString(
    "base64url",
  );
}

export function decodeBusinessCalendarCursor(
  value: string,
  expected: BusinessCalendarCursorBinding,
): BusinessCalendarCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<BusinessCalendarCursor>;
    const startsAt = new Date(parsed.startsAt ?? "");
    const snapshotAt = new Date(parsed.snapshotAt ?? "");
    if (
      parsed.version !== 1 ||
      parsed.organizationId !== expected.organizationId ||
      parsed.role !== expected.role ||
      parsed.scope !== expected.scope ||
      parsed.selectedDate !== expected.selectedDate ||
      parsed.view !== expected.view ||
      !parsed.filters ||
      !sameFilters(parsed.filters, expected.filters) ||
      typeof parsed.id !== "string" ||
      !UUID_PATTERN.test(parsed.id) ||
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.toISOString() !== parsed.startsAt ||
      !Number.isFinite(snapshotAt.getTime()) ||
      snapshotAt.toISOString() !== parsed.snapshotAt
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as BusinessCalendarCursor;
  } catch {
    businessOperationsError(
      "INVALID_REQUEST",
      "The Business calendar cursor is invalid for this scope or filter.",
    );
  }
}

export function businessCalendarCursorWhere(
  view: BusinessCalendarView,
  cursor: Pick<BusinessCalendarCursor, "id" | "startsAt">,
): Prisma.BookingWhereInput {
  const startsAt = new Date(cursor.startsAt);
  const ascending = view === "today" || view === "upcoming";
  return {
    OR: [
      { startsAt: ascending ? { gt: startsAt } : { lt: startsAt } },
      { startsAt, id: ascending ? { gt: cursor.id } : { lt: cursor.id } },
    ],
  };
}

export function businessCalendarOrder(view: BusinessCalendarView) {
  const direction = view === "today" || view === "upcoming" ? "asc" : "desc";
  return [{ startsAt: direction }, { id: direction }] as const;
}

export function calendarScopeForRole(role: SystemRole): BusinessCalendarScope {
  if (role === "STAFF") return "STAFF_SELF";
  if (role === "RECEPTIONIST") return "RECEPTIONIST";
  return "MANAGEMENT";
}

export function normalizeBusinessCalendarView(value: string | undefined): BusinessCalendarView {
  return BUSINESS_CALENDAR_VIEWS.includes(value as BusinessCalendarView)
    ? (value as BusinessCalendarView)
    : "today";
}

export function normalizeBusinessCalendarType(value: string | undefined): BusinessCalendarType {
  return BUSINESS_CALENDAR_TYPES.includes(value as BusinessCalendarType)
    ? (value as BusinessCalendarType)
    : "all";
}

export function normalizeBusinessCalendarStatus(
  value: string | undefined,
): BookingStatus | "all" {
  return BUSINESS_CALENDAR_STATUSES.includes(value as BookingStatus)
    ? (value as BookingStatus)
    : "all";
}

export const BOOKING_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
} as const satisfies Readonly<Record<BookingStatus, readonly BookingStatus[]>>;

export function availableOperationalBookingTransitions(
  booking: { startsAt: Date; status: BookingStatus },
  now = new Date(),
): BookingStatus[] {
  if (booking.status === "PENDING") {
    return booking.startsAt >= now ? ["CONFIRMED", "CANCELLED"] : ["CANCELLED"];
  }
  if (booking.status === "CONFIRMED") {
    return booking.startsAt <= now
      ? ["CANCELLED", "COMPLETED", "NO_SHOW"]
      : ["CANCELLED"];
  }
  return [];
}

export function assertOperationalBookingTransition(
  booking: { startsAt: Date; status: BookingStatus },
  nextStatus: BookingStatus,
  now = new Date(),
) {
  if (!availableOperationalBookingTransitions(booking, now).includes(nextStatus)) {
    businessOperationsError(
      "BOOKING_STATE_CONFLICT",
      "The Booking status or timing does not allow this transition.",
    );
  }
}

export const operationalCancellationReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500);

const nullableText = (maximum: number) =>
  z.union([z.string().trim().max(maximum), z.null()])
    .transform((value) => value || null);
const operationalRestaurantTableFields = {
  area: nullableText(120),
  capacity: z.number().int().min(1).max(100),
  code: nullableText(40),
  floor: nullableText(80),
  name: z.string().trim().min(1).max(120),
  positionLabel: nullableText(120),
};

export const operationalRestaurantTableCreateSchema = z.object({
  ...operationalRestaurantTableFields,
  branchId: z.string().uuid(),
}).strict();

export const operationalRestaurantTableUpdateSchema = z.object(
  operationalRestaurantTableFields,
).strict();

export const operationalMenuCategorySchema = z.object({
  description: nullableText(500),
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict();

const decimalPrice = z
  .string()
  .trim()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);

export const operationalMenuItemSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  description: nullableText(1000),
  menuCategoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  preparationMinutes: z.number().int().min(1).max(1440).nullable(),
  price: decimalPrice,
  sortOrder: z.number().int().min(0).max(10_000),
}).strict();

export const operationalRestaurantRescheduleSchema = z.object({
  customerNote: nullableText(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().min(1).max(100),
  seatingArea: nullableText(120),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  tableId: z.string().uuid().nullable(),
}).strict();

export const SAFE_OPERATIONAL_ACTIVITY_EVENTS = [
  "GENERIC_CHANGE_ACCEPTED",
  "BUSINESS_CHANGE_PROPOSED",
  "RESTAURANT_RESCHEDULED",
  "TABLE_REASSIGNED",
] as const;

export type SafeOperationalActivityEvent =
  | `STATUS_${BookingStatus}`
  | (typeof SAFE_OPERATIONAL_ACTIVITY_EVENTS)[number];

export function safeOperationalActivity(entry: {
  fromStatus: BookingStatus | null;
  note: string | null;
  toStatus: BookingStatus;
}): SafeOperationalActivityEvent | null {
  if (entry.fromStatus !== entry.toStatus) return `STATUS_${entry.toStatus}`;
  return SAFE_OPERATIONAL_ACTIVITY_EVENTS.includes(
    entry.note as (typeof SAFE_OPERATIONAL_ACTIVITY_EVENTS)[number],
  )
    ? (entry.note as (typeof SAFE_OPERATIONAL_ACTIVITY_EVENTS)[number])
    : null;
}
