import type {
  MobileManagedRestaurantReservation,
  MobileRestaurantReservationManagementPage,
} from "../types/restaurant-reservations";

export function mergeMobileRestaurantReservationPage(
  current: readonly MobileManagedRestaurantReservation[],
  page: MobileRestaurantReservationManagementPage,
  append: boolean,
) {
  if (!append) return page.items;
  const byId = new Map(current.map((reservation) => [reservation.id, reservation]));
  for (const reservation of page.items) byId.set(reservation.id, reservation);
  return [...byId.values()];
}

export function mobileRestaurantManagementFailure(code: string | undefined) {
  return {
    sessionExpired:
      code === "UNAUTHENTICATED" || code === "CUSTOMER_UNAVAILABLE",
    conflict: [
      "BOOKING_STATE_CONFLICT",
      "BOOKING_NOT_CANCELLABLE",
      "BOOKING_NOT_RESCHEDULABLE",
      "CANCELLATION_DEADLINE_PASSED",
      "BUSINESS_UNAVAILABLE",
      "CAPACITY_UNAVAILABLE",
      "RESTAURANT_CLOSED",
      "SLOT_UNAVAILABLE",
      "TABLE_CONFLICT",
    ].includes(code ?? ""),
  };
}

export function createRestaurantManagementSubmissionGate() {
  let inFlight = false;
  return {
    finish() {
      inFlight = false;
    },
    tryBegin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
  };
}

export function nextRestaurantReservationDates(
  timezone: string,
  count = 14,
  now = new Date(),
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter.format(now).split("-").map(Number);
  const start = Date.UTC(year!, month! - 1, day!);
  return Array.from({ length: count }, (_, offset) =>
    new Date(start + offset * 86_400_000).toISOString().slice(0, 10),
  );
}
