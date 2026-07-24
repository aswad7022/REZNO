export type CommunicationErrorCode =
  | "CAMPAIGN_CANCELLED"
  | "CAMPAIGN_NOT_EDITABLE"
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "PROVIDER_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "STALE_VERSION"
  | "VALIDATION_ERROR";

export class CommunicationDomainError extends Error {
  constructor(
    public readonly code: CommunicationErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CommunicationDomainError";
  }
}

export class CommunicationOperationRetryableError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly state: string,
  ) {
    super("The exact communication operation is still owned by a live domain claim.");
    this.name = "CommunicationOperationRetryableError";
  }
}

const STATUS_BY_CODE: Record<CommunicationErrorCode, number> = {
  CAMPAIGN_CANCELLED: 409,
  CAMPAIGN_NOT_EDITABLE: 409,
  FORBIDDEN: 403,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_CURSOR: 400,
  NOT_FOUND: 404,
  PROVIDER_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  STALE_VERSION: 409,
  VALIDATION_ERROR: 400,
};

export function communicationError(
  code: CommunicationErrorCode,
  message: string,
): never {
  throw new CommunicationDomainError(code, message, STATUS_BY_CODE[code]);
}
