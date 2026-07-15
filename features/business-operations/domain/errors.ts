export type BusinessOperationsErrorCode =
  | "ACTIVE_ORGANIZATION_CHANGED"
  | "BLOCK_TIME_CONFLICT"
  | "BRANCH_ARCHIVE_CONFLICT"
  | "BRANCH_LAST_ACTIVE"
  | "BRANCH_NOT_FOUND"
  | "FORBIDDEN"
  | "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REQUEST"
  | "MEMBERSHIP_UNAVAILABLE"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "STALE_VERSION"
  | "TIMEZONE_CHANGE_CONFLICT";

export class BusinessOperationsError extends Error {
  constructor(
    public readonly code: BusinessOperationsErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, boolean | number | string | null>>,
  ) {
    super(message);
    this.name = "BusinessOperationsError";
  }
}

export function businessOperationsError(
  code: BusinessOperationsErrorCode,
  message: string,
  details?: Readonly<Record<string, boolean | number | string | null>>,
): never {
  throw new BusinessOperationsError(code, message, details);
}
