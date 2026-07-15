import { createHash } from "node:crypto";

import type { BookingStatus, Prisma } from "@prisma/client";

import { restaurantReservationError } from "@/features/restaurants/domain/reservation-errors";

const CURSOR_VERSION = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ACTIVE_RESTAURANT_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
] as const;
export const DEFAULT_RESTAURANT_RESERVATION_PAGE_SIZE = 20;
export const MAX_RESTAURANT_RESERVATION_PAGE_SIZE = 50;

export type CustomerRestaurantReservationTab =
  | "all"
  | "upcoming"
  | "completed"
  | "cancelled";

export type CustomerRestaurantReservationCursor = {
  version: 1;
  tab: CustomerRestaurantReservationTab;
  startsAt: string;
  id: string;
  snapshotAt: string;
};

export function restaurantReservationCancellationDeadline(
  startsAt: Date,
  cancellationWindowHours: number | null | undefined,
) {
  return new Date(
    startsAt.getTime() - (cancellationWindowHours ?? 24) * 3_600_000,
  );
}

export function canCustomerManageRestaurantReservation(
  reservation: {
    startsAt: Date;
    status: BookingStatus;
    cancellationWindowHours?: number | null;
  },
  now = new Date(),
) {
  return (
    ACTIVE_RESTAURANT_RESERVATION_STATUSES.includes(
      reservation.status as (typeof ACTIVE_RESTAURANT_RESERVATION_STATUSES)[number],
    ) &&
    now <
      restaurantReservationCancellationDeadline(
        reservation.startsAt,
        reservation.cancellationWindowHours,
      )
  );
}

export function restaurantReservationRelationshipsAreValid(booking: {
  branchId: string;
  organizationId: string;
  restaurantReservation: {
    branchId: string | null;
    businessId: string;
    table: { branchId: string | null; businessId: string };
    items?: Array<{ menuItem: { businessId: string } }>;
  } | null;
}) {
  const reservation = booking.restaurantReservation;
  return Boolean(
    reservation &&
      reservation.businessId === booking.organizationId &&
      reservation.branchId === booking.branchId &&
      reservation.table.businessId === booking.organizationId &&
      reservation.table.branchId === booking.branchId &&
      (reservation.items?.every(
        (item) => item.menuItem.businessId === booking.organizationId,
      ) ?? true),
  );
}

export function encodeCustomerRestaurantReservationCursor(
  value: Omit<CustomerRestaurantReservationCursor, "version">,
) {
  return Buffer.from(
    JSON.stringify({ version: CURSOR_VERSION, ...value }),
    "utf8",
  ).toString("base64url");
}

export function decodeCustomerRestaurantReservationCursor(
  value: string,
  expectedTab: CustomerRestaurantReservationTab,
): CustomerRestaurantReservationCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CustomerRestaurantReservationCursor>;
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
    return parsed as CustomerRestaurantReservationCursor;
  } catch {
    restaurantReservationError(
      "INVALID_REQUEST",
      "Restaurant reservation cursor is invalid.",
    );
  }
}

export function customerRestaurantReservationTabWhere(
  tab: CustomerRestaurantReservationTab,
  snapshotAt: Date,
): Prisma.BookingWhereInput {
  if (tab === "upcoming") {
    return {
      startsAt: { gte: snapshotAt },
      status: { in: [...ACTIVE_RESTAURANT_RESERVATION_STATUSES] },
    };
  }
  if (tab === "completed") return { status: "COMPLETED" };
  if (tab === "cancelled") return { status: "CANCELLED" };
  return {};
}

export function customerRestaurantReservationCursorWhere(
  cursor: CustomerRestaurantReservationCursor,
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

export function customerRestaurantReservationOrder(
  tab: CustomerRestaurantReservationTab,
) {
  const direction = tab === "upcoming" ? "asc" : "desc";
  return [{ startsAt: direction }, { id: direction }] as const;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function restaurantCancellationRequestHash(input: {
  bookingId: string;
  reason: string | null;
}) {
  return stableHash({ bookingId: input.bookingId, reason: input.reason });
}

export function restaurantRescheduleRequestHash(input: {
  bookingId: string;
  customerNote: string | null;
  date: string;
  guestCount: number;
  seatingArea: string | null;
  startsAt: string;
}) {
  return stableHash({
    bookingId: input.bookingId,
    customerNote: input.customerNote,
    date: input.date,
    guestCount: input.guestCount,
    seatingArea: input.seatingArea,
    startsAt: input.startsAt,
  });
}
