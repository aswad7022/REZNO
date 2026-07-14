import {
  BookingDomainError,
  type BookingDomainErrorCode,
} from "@/features/bookings/domain/errors";

export type BookingApiErrorCode =
  | BookingDomainErrorCode
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "INTERNAL_ERROR"
  | "PROFILE_INCOMPLETE"
  | "PROFILE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED";

export class BookingApiError extends Error {
  constructor(
    readonly code: BookingApiErrorCode,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "BookingApiError";
  }
}

export function bookingApiError(
  code: BookingApiErrorCode,
  status: BookingApiError["status"],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new BookingApiError(code, status, message, details);
}

export function mapBookingApiError(error: unknown): BookingApiError {
  if (error instanceof BookingApiError) return error;
  if (error instanceof BookingDomainError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CUSTOMER_UNAVAILABLE"
          ? 403
          : error.code === "INVALID_REQUEST" ||
              error.code === "STAFF_REQUIRED"
            ? 400
            : 409;
    return new BookingApiError(error.code, status, error.message, error.details);
  }
  return new BookingApiError(
    "INTERNAL_ERROR",
    500,
    "Booking request could not be completed.",
  );
}
