export type CommerceErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INSUFFICIENT_STOCK"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_CONFLICT"
  | "STORE_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "CART_VERSION_CONFLICT";

export class CommerceDomainError extends Error {
  constructor(
    readonly code: CommerceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "CommerceDomainError";
  }
}

export function commerceError(
  code: CommerceErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new CommerceDomainError(code, message, details);
}
