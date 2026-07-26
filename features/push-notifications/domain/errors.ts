export type PushNotificationErrorCode =
  | "AUTHENTICATION_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "INSTALLATION_OWNERSHIP_MISMATCH"
  | "NOT_FOUND"
  | "PROVIDER_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "RECEIPT_REJECTED"
  | "SERVICE_UNAVAILABLE"
  | "STALE_OPERATION"
  | "TOKEN_ALREADY_REGISTERED"
  | "VALIDATION_ERROR";

const STATUS_BY_CODE: Record<PushNotificationErrorCode, number> = {
  AUTHENTICATION_FAILED: 401,
  IDEMPOTENCY_CONFLICT: 409,
  INSTALLATION_OWNERSHIP_MISMATCH: 403,
  NOT_FOUND: 404,
  PROVIDER_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  RECEIPT_REJECTED: 401,
  SERVICE_UNAVAILABLE: 503,
  STALE_OPERATION: 409,
  TOKEN_ALREADY_REGISTERED: 409,
  VALIDATION_ERROR: 400,
};

export class PushNotificationDomainError extends Error {
  constructor(
    readonly code: PushNotificationErrorCode,
    message: string,
    readonly status = STATUS_BY_CODE[code],
  ) {
    super(message);
    this.name = "PushNotificationDomainError";
  }
}

export function pushNotificationError(
  code: PushNotificationErrorCode,
  message: string,
): never {
  throw new PushNotificationDomainError(code, message);
}
