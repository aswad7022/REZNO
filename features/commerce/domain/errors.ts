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
  | "VARIANT_UNAVAILABLE"
  | "CART_VERSION_CONFLICT"
  | "CART_STORE_CONFLICT"
  | "CART_ITEM_UNAVAILABLE"
  | "MINIMUM_ORDER_NOT_MET"
  | "INVALID_FULFILLMENT_METHOD"
  | "ADDRESS_REQUIRED"
  | "ADDRESS_NOT_ALLOWED"
  | "ADDRESS_OWNERSHIP_REQUIRED"
  | "INVENTORY_CONFLICT"
  | "ACTIVE_ORGANIZATION_CHANGED"
  | "MEMBERSHIP_UNAVAILABLE"
  | "STALE_VERSION"
  | "RATE_LIMITED"
  | "FAVORITE_NOT_FOUND"
  | "ORDER_NOT_CANCELLABLE"
  | "INVALID_CURSOR";

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
