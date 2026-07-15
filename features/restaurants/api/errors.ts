import {
  RestaurantReservationError,
  type RestaurantReservationErrorCode,
} from "@/features/restaurants/domain/reservation-errors";

export type RestaurantReservationApiErrorCode =
  | RestaurantReservationErrorCode
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "INTERNAL_ERROR"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED";

export class RestaurantReservationApiError extends Error {
  constructor(
    readonly code: RestaurantReservationApiErrorCode,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "RestaurantReservationApiError";
  }
}

export function restaurantReservationApiError(
  code: RestaurantReservationApiErrorCode,
  status: RestaurantReservationApiError["status"],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new RestaurantReservationApiError(code, status, message, details);
}

export function mapRestaurantReservationApiError(error: unknown) {
  if (error instanceof RestaurantReservationApiError) return error;
  if (error instanceof RestaurantReservationError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CUSTOMER_UNAVAILABLE"
          ? 403
          : error.code === "INVALID_REQUEST" || error.code === "DATE_OUT_OF_RANGE"
            ? 400
            : 409;
    return new RestaurantReservationApiError(
      error.code,
      status,
      error.message,
      error.details,
    );
  }
  return new RestaurantReservationApiError(
    "INTERNAL_ERROR",
    500,
    "Restaurant reservation request could not be completed.",
  );
}
