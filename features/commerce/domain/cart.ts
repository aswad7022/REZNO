import { commerceError } from "./errors";

export const MAX_CART_ITEM_QUANTITY = 99;

export function assertCartStore(currentStoreId: string, nextStoreId: string) {
  if (currentStoreId !== nextStoreId) {
    commerceError("CONFLICT", "A cart may contain products from one Store only.", {
      currentStoreId,
      nextStoreId,
    });
  }
}

export function mergeCartQuantity(current: number, added: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(added) || current < 0 || added < 1) {
    return commerceError("VALIDATION_ERROR", "Cart quantities must be positive integers.");
  }

  const merged = current + added;
  if (merged > MAX_CART_ITEM_QUANTITY) {
    return commerceError(
      "VALIDATION_ERROR",
      `Cart item quantity cannot exceed ${MAX_CART_ITEM_QUANTITY}.`,
    );
  }
  return merged;
}

export function assertCartVersion(actual: number, expected: number) {
  if (!Number.isInteger(expected) || actual !== expected) {
    commerceError("CART_VERSION_CONFLICT", "The Cart changed. Refresh and retry.", {
      actual,
      expected,
    });
  }
}
