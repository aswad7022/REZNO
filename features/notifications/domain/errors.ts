export type NotificationErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "VALIDATION_ERROR";

export class NotificationDomainError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NotificationDomainError";
  }
}

export function notificationError(
  code: NotificationErrorCode,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new NotificationDomainError(code, message, details);
}
