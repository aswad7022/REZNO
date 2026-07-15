export type RestaurantReservationErrorCode =
  | "BOOKING_NOT_CANCELLABLE"
  | "BOOKING_NOT_RESCHEDULABLE"
  | "BOOKING_STATE_CONFLICT"
  | "BUSINESS_UNAVAILABLE"
  | "CANCELLATION_DEADLINE_PASSED"
  | "CAPACITY_UNAVAILABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "DATE_OUT_OF_RANGE"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REQUEST"
  | "MENU_ITEM_UNAVAILABLE"
  | "NOT_FOUND"
  | "RESTAURANT_CLOSED"
  | "RESTAURANT_FLOW_REQUIRED"
  | "SLOT_UNAVAILABLE"
  | "TABLE_CONFLICT";

export class RestaurantReservationError extends Error {
  constructor(
    readonly code: RestaurantReservationErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "RestaurantReservationError";
  }
}

export function restaurantReservationError(
  code: RestaurantReservationErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new RestaurantReservationError(code, message, details);
}
