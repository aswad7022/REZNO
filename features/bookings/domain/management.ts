import { createHash } from "node:crypto";

import type { BookingStatus, Prisma } from "@prisma/client";

import { bookingDomainError } from "@/features/bookings/domain/errors";
import type { CustomerBookingTab } from "@/features/bookings/policies/booking-lifecycle";

const CURSOR_VERSION = 1;
export const DEFAULT_CUSTOMER_BOOKING_PAGE_SIZE = 20;
export const MAX_CUSTOMER_BOOKING_PAGE_SIZE = 50;

export type CustomerBookingCursor = {
  version: 1;
  tab: CustomerBookingTab;
  startsAt: string;
  id: string;
  snapshotAt: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeCustomerBookingCursor(
  value: Omit<CustomerBookingCursor, "version">,
): string {
  return Buffer.from(
    JSON.stringify({ version: CURSOR_VERSION, ...value }),
    "utf8",
  ).toString("base64url");
}

export function decodeCustomerBookingCursor(
  value: string,
  expectedTab: CustomerBookingTab,
): CustomerBookingCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CustomerBookingCursor>;
    const startsAt = new Date(parsed.startsAt ?? "");
    const snapshotAt = new Date(parsed.snapshotAt ?? "");
    if (
      parsed.version !== CURSOR_VERSION ||
      parsed.tab !== expectedTab ||
      typeof parsed.id !== "string" ||
      !UUID_PATTERN.test(parsed.id) ||
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.toISOString() !== parsed.startsAt ||
      !Number.isFinite(snapshotAt.getTime()) ||
      snapshotAt.toISOString() !== parsed.snapshotAt
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as CustomerBookingCursor;
  } catch {
    bookingDomainError("INVALID_REQUEST", "Booking cursor is invalid.");
  }
}

export function customerBookingTabWhere(
  tab: CustomerBookingTab,
  snapshotAt: Date,
): Prisma.BookingWhereInput {
  if (tab === "upcoming") {
    return {
      startsAt: { gte: snapshotAt },
      status: { in: ["PENDING", "CONFIRMED"] },
    };
  }
  if (tab === "completed") return { status: "COMPLETED" };
  if (tab === "cancelled") return { status: "CANCELLED" };
  return {};
}

export function customerBookingCursorWhere(
  cursor: CustomerBookingCursor,
): Prisma.BookingWhereInput {
  const startsAt = new Date(cursor.startsAt);
  const ascending = cursor.tab === "upcoming";
  return {
    OR: [
      { startsAt: ascending ? { gt: startsAt } : { lt: startsAt } },
      {
        startsAt,
        id: ascending ? { gt: cursor.id } : { lt: cursor.id },
      },
    ],
  };
}

export function customerBookingOrder(tab: CustomerBookingTab) {
  const direction = tab === "upcoming" ? "asc" : "desc";
  return [
    { startsAt: direction },
    { id: direction },
  ] as const;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function cancellationRequestHash(input: {
  bookingId: string;
  reason: string | null;
}): string {
  return stableHash({ bookingId: input.bookingId, reason: input.reason });
}

export function changeRequestHash(input: {
  bookingId: string;
  date: string;
  startsAt: string;
  memberId: string | null;
}): string {
  return stableHash({
    bookingId: input.bookingId,
    date: input.date,
    startsAt: input.startsAt,
    memberId: input.memberId,
  });
}

export function customerBookingCountBucket(
  status: BookingStatus,
  startsAt: Date,
  snapshotAt: Date,
): "upcoming" | "completed" | "cancelled" | null {
  if (
    (status === "PENDING" || status === "CONFIRMED") &&
    startsAt >= snapshotAt
  ) {
    return "upcoming";
  }
  if (status === "COMPLETED") return "completed";
  if (status === "CANCELLED") return "cancelled";
  return null;
}
