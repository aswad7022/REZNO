export type MessageErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "STALE_VERSION"
  | "VALIDATION_ERROR";

export class MessageDomainError extends Error {
  constructor(
    public readonly code: MessageErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MessageDomainError";
  }
}

const STATUS_BY_CODE: Record<MessageErrorCode, number> = {
  FORBIDDEN: 403,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_CURSOR: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  STALE_VERSION: 409,
  VALIDATION_ERROR: 400,
};

export function messageError(code: MessageErrorCode, message: string): never {
  throw new MessageDomainError(code, message, STATUS_BY_CODE[code]);
}
