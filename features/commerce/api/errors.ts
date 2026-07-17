import { CommerceDomainError } from "@/features/commerce/domain/errors";
import { PublicCommerceError } from "@/features/commerce/public/errors";

export type CommerceApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "INVALID_CURSOR"
  | "CART_VERSION_CONFLICT"
  | "CART_STORE_CONFLICT"
  | "CART_ITEM_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "MINIMUM_ORDER_NOT_MET"
  | "INVALID_FULFILLMENT_METHOD"
  | "ADDRESS_REQUIRED"
  | "ADDRESS_NOT_ALLOWED"
  | "ADDRESS_OWNERSHIP_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "STORE_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_UNAVAILABLE"
  | "INVENTORY_CONFLICT"
  | "STALE_VERSION"
  | "ORDER_NOT_CANCELLABLE"
  | "CANCELLATION_REASON_REQUIRED"
  | "ORDER_STATE_CONFLICT"
  | "FAVORITE_ALREADY_EXISTS"
  | "FAVORITE_NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class CommerceApiError extends Error {
  constructor(
    readonly code: CommerceApiErrorCode,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "CommerceApiError";
  }
}

export function commerceApiError(
  code: CommerceApiErrorCode,
  status: CommerceApiError["status"],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new CommerceApiError(code, status, message, details);
}

export function mapCommerceApiError(error: unknown) {
  if (error instanceof CommerceApiError) return error;
  if (error instanceof PublicCommerceError) {
    return new CommerceApiError(
      error.code === "INVALID_CURSOR" ? "INVALID_CURSOR" : "INVALID_REQUEST",
      error.status === 400 ? 400 : 500,
      error.message,
    );
  }
  if (error instanceof CommerceDomainError) {
    const directCodes = new Set<CommerceApiErrorCode>([
      "FORBIDDEN",
      "NOT_FOUND",
      "CART_VERSION_CONFLICT",
      "CART_STORE_CONFLICT",
      "CART_ITEM_UNAVAILABLE",
      "INSUFFICIENT_STOCK",
      "MINIMUM_ORDER_NOT_MET",
      "INVALID_FULFILLMENT_METHOD",
      "ADDRESS_REQUIRED",
      "ADDRESS_NOT_ALLOWED",
      "ADDRESS_OWNERSHIP_REQUIRED",
      "IDEMPOTENCY_CONFLICT",
      "STORE_UNAVAILABLE",
      "PRODUCT_UNAVAILABLE",
      "VARIANT_UNAVAILABLE",
      "INVENTORY_CONFLICT",
      "STALE_VERSION",
      "ORDER_NOT_CANCELLABLE",
      "FAVORITE_NOT_FOUND",
      "INVALID_CURSOR",
    ]);
    const code: CommerceApiErrorCode =
      error.code === "UNAUTHORIZED"
        ? "UNAUTHENTICATED"
        : error.code === "VALIDATION_ERROR"
          ? "INVALID_REQUEST"
          : error.code === "CONFLICT"
            ? error.details?.kind === "CART_STORE_CONFLICT"
              ? "CART_STORE_CONFLICT"
              : "INVENTORY_CONFLICT"
            : directCodes.has(error.code as CommerceApiErrorCode)
              ? (error.code as CommerceApiErrorCode)
              : "INVALID_REQUEST";
    const status =
      code === "UNAUTHENTICATED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : code === "ADDRESS_OWNERSHIP_REQUIRED" || code === "FAVORITE_NOT_FOUND"
              ? 404
              : code === "INVALID_REQUEST" ||
                    code === "INVALID_CURSOR" ||
                    code === "ADDRESS_REQUIRED" ||
                    code === "ADDRESS_NOT_ALLOWED" ||
                    code === "INVALID_FULFILLMENT_METHOD"
              ? 400
              : 409;
    return new CommerceApiError(code, status, error.message, safeErrorDetails(code, error.details));
  }
  return new CommerceApiError(
    "INTERNAL_ERROR",
    500,
    "The Commerce request could not be completed.",
  );
}

function safeErrorDetails(
  code: CommerceApiErrorCode,
  details: Readonly<Record<string, unknown>> | undefined,
) {
  if (code !== "CART_STORE_CONFLICT" || !details) return undefined;
  return {
    cartVersion: details.cartVersion,
    currentStore: details.currentStore,
    incomingStore: details.incomingStore,
  };
}
