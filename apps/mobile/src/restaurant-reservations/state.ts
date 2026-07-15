import type {
  MobileRestaurantBranch,
  MobileRestaurantReservationDetail,
} from "../types/restaurant-reservations";

export type MobileRestaurantReservationStep =
  | "business"
  | "branch"
  | "guests"
  | "datetime"
  | "seating"
  | "menu"
  | "review"
  | "detail";

export type MobileRestaurantReservationSelection = {
  branch: MobileRestaurantBranch | null;
  guestCount: number | null;
  date: string | null;
  slot: { startsAt: string; endsAt: string } | null;
  seatingArea: string | null;
  preorderItems: Record<string, number>;
  customerNote: string;
};

export const EMPTY_RESTAURANT_RESERVATION_SELECTION: MobileRestaurantReservationSelection = {
  branch: null,
  guestCount: null,
  date: null,
  slot: null,
  seatingArea: null,
  preorderItems: {},
  customerNote: "",
};

export function selectMobileRestaurantBranch(
  current: MobileRestaurantReservationSelection,
  branch: MobileRestaurantBranch,
) {
  return { ...current, branch, date: null, slot: null, seatingArea: null };
}

export function selectMobileRestaurantGuests(
  current: MobileRestaurantReservationSelection,
  guestCount: number,
) {
  return { ...current, guestCount, date: null, slot: null, seatingArea: null };
}

export function selectMobileRestaurantDate(
  current: MobileRestaurantReservationSelection,
  date: string,
) {
  return { ...current, date, slot: null, seatingArea: null };
}

export function selectMobileRestaurantSlot(
  current: MobileRestaurantReservationSelection,
  slot: { startsAt: string; endsAt: string },
) {
  return { ...current, slot, seatingArea: null };
}

export function restaurantPreorderItems(
  quantities: Readonly<Record<string, number>>,
) {
  return Object.entries(quantities)
    .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function canReviewMobileRestaurantReservation(
  selection: MobileRestaurantReservationSelection,
) {
  return Boolean(
    selection.branch &&
    selection.guestCount &&
    selection.date &&
    selection.slot,
  );
}

export function createRestaurantReservationSubmissionGate() {
  let inFlight = false;
  return {
    finish() { inFlight = false; },
    tryBegin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
  };
}

const AUTH_CODES = new Set(["UNAUTHENTICATED", "CUSTOMER_UNAVAILABLE"]);
const CAPACITY_CODES = new Set([
  "CAPACITY_UNAVAILABLE",
  "TABLE_CONFLICT",
  "RESTAURANT_CLOSED",
  "DATE_OUT_OF_RANGE",
]);

export function mobileRestaurantReservationFailure(code: string | undefined) {
  return {
    requiresAuthentication: code ? AUTH_CODES.has(code) : false,
    returnToAvailability: code ? CAPACITY_CODES.has(code) : false,
    returnToMenu: code === "MENU_ITEM_UNAVAILABLE",
    idempotencyConflict: code === "IDEMPOTENCY_CONFLICT",
  };
}

export function isPersistedRestaurantConfirmation(
  value: MobileRestaurantReservationDetail | null,
) {
  return Boolean(value?.id && value.reference && value.status);
}
