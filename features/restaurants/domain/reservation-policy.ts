import { createHash } from "node:crypto";

import { TZDate } from "@date-fns/tz";

import { restaurantReservationError } from "@/features/restaurants/domain/reservation-errors";

export const RESTAURANT_RESERVATION_DURATION_MINUTES = 90;
export const RESTAURANT_RESERVATION_INTERVAL_MINUTES = 30;
export const RESTAURANT_RESERVATION_MAX_DAYS = 90;
export const RESTAURANT_RESERVATION_MAX_GUESTS = 100;
export const RESTAURANT_RESERVATION_MAX_ITEM_QUANTITY = 20;
export const RESTAURANT_RESERVATION_MAX_NOTE_LENGTH = 500;

export interface RestaurantReservationPreorderInput {
  itemId: string;
  quantity: number;
}

export interface RestaurantReservationSelection {
  businessSlug: string;
  branchId: string;
  customerNote: string | null;
  date: string;
  durationMinutes: number;
  guestCount: number;
  preorderItems: readonly RestaurantReservationPreorderInput[];
  seatingArea: string | null;
  startsAt: string;
}

export interface RestaurantTableCandidate {
  area: string | null;
  capacity: number;
  id: string;
  name: string;
}

export interface ParsedRestaurantDate {
  day: number;
  month: number;
  year: number;
}

export function parseRestaurantDate(value: string): ParsedRestaurantDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parsed.year, parsed.month, parsed.day));
  return date.getUTCFullYear() === parsed.year &&
    date.getUTCMonth() === parsed.month &&
    date.getUTCDate() === parsed.day
    ? parsed
    : null;
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localDateForInstant(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localTimeParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  return {
    year: part("year"),
    month: part("month") - 1,
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

export function restaurantLocalTime(
  date: ParsedRestaurantDate,
  time: string,
  timezone: string,
): Date | null {
  if (!isValidIanaTimezone(timezone)) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const instant = new Date(
    new TZDate(date.year, date.month, date.day, hour, minute, timezone),
  );
  const roundTrip = localTimeParts(instant, timezone);
  return roundTrip.year === date.year &&
    roundTrip.month === date.month &&
    roundTrip.day === date.day &&
    roundTrip.hour === hour &&
    roundTrip.minute === minute
    ? instant
    : null;
}

export function validateRestaurantDateRange(
  date: string,
  timezone: string,
  now = new Date(),
): ParsedRestaurantDate {
  const parsed = parseRestaurantDate(date);
  if (!parsed || !isValidIanaTimezone(timezone)) {
    restaurantReservationError("INVALID_REQUEST", "Reservation date or branch timezone is invalid.");
  }
  const today = parseRestaurantDate(localDateForInstant(now, timezone))!;
  const requestedDay = Date.UTC(parsed.year, parsed.month, parsed.day);
  const todayValue = Date.UTC(today.year, today.month, today.day);
  const distance = Math.round((requestedDay - todayValue) / 86_400_000);
  if (distance < 0 || distance > RESTAURANT_RESERVATION_MAX_DAYS) {
    restaurantReservationError(
      "DATE_OUT_OF_RANGE",
      `Reservation date must be within ${RESTAURANT_RESERVATION_MAX_DAYS} days.`,
    );
  }
  return parsed;
}

export function validateRestaurantGuestCount(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > RESTAURANT_RESERVATION_MAX_GUESTS
  ) {
    restaurantReservationError(
      "INVALID_REQUEST",
      `guestCount must be an integer from 1 to ${RESTAURANT_RESERVATION_MAX_GUESTS}.`,
    );
  }
  return value;
}

export function normalizeRestaurantNote(value: string | null | undefined) {
  if (value !== null && value !== undefined && typeof value !== "string") {
    restaurantReservationError("INVALID_REQUEST", "customerNote must be a string or null.");
  }
  const note = value?.trim() ?? "";
  if (note.length > RESTAURANT_RESERVATION_MAX_NOTE_LENGTH) {
    restaurantReservationError(
      "INVALID_REQUEST",
      `customerNote must not exceed ${RESTAURANT_RESERVATION_MAX_NOTE_LENGTH} characters.`,
    );
  }
  return note || null;
}

export function normalizeRestaurantPreorder(
  values: readonly RestaurantReservationPreorderInput[],
): RestaurantReservationPreorderInput[] {
  if (values.length > 100) {
    restaurantReservationError(
      "INVALID_REQUEST",
      "preorderItems must contain at most 100 entries.",
    );
  }
  const normalized = new Map<string, number>();
  for (const value of values) {
    if (
      !value ||
      typeof value.itemId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.itemId,
      ) ||
      !Number.isInteger(value.quantity) ||
      value.quantity < 1
    ) {
      restaurantReservationError(
        "INVALID_REQUEST",
        "Each preorder item requires an itemId and positive integer quantity.",
      );
    }
    const itemId = value.itemId.toLowerCase();
    const quantity = (normalized.get(itemId) ?? 0) + value.quantity;
    if (quantity > RESTAURANT_RESERVATION_MAX_ITEM_QUANTITY) {
      restaurantReservationError(
        "INVALID_REQUEST",
        `Each preorder quantity must not exceed ${RESTAURANT_RESERVATION_MAX_ITEM_QUANTITY}.`,
      );
    }
    normalized.set(itemId, quantity);
  }
  return [...normalized.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function selectRestaurantTable(
  tables: readonly RestaurantTableCandidate[],
  guestCount: number,
  seatingArea: string | null,
): RestaurantTableCandidate | null {
  const eligible = tables
    .filter(
      (table) =>
        table.capacity >= guestCount &&
        (seatingArea === null || table.area === seatingArea),
    )
    .sort(
      (left, right) =>
        left.capacity - right.capacity ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
  return eligible[0] ?? null;
}

export function restaurantReservationRequestHash(
  selection: RestaurantReservationSelection,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        businessSlug: selection.businessSlug,
        branchId: selection.branchId,
        customerNote: selection.customerNote,
        date: selection.date,
        durationMinutes: selection.durationMinutes,
        guestCount: selection.guestCount,
        preorderItems: selection.preorderItems,
        seatingArea: selection.seatingArea,
        startsAt: selection.startsAt,
      }),
    )
    .digest("hex");
}

export function restaurantReservationReference(bookingId: string) {
  return `RZR-${bookingId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
