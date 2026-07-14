export type BookingDomainErrorCode =
  | "BUSINESS_UNAVAILABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "RESTAURANT_FLOW_REQUIRED"
  | "SERVICE_UNAVAILABLE"
  | "SLOT_CONFLICT"
  | "SLOT_UNAVAILABLE"
  | "STAFF_REQUIRED"
  | "STAFF_UNAVAILABLE";

export class BookingDomainError extends Error {
  constructor(
    readonly code: BookingDomainErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "BookingDomainError";
  }
}

export function bookingDomainError(
  code: BookingDomainErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new BookingDomainError(code, message, details);
}
