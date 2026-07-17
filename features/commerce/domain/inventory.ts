import { createHash } from "node:crypto";

export const RESERVATION_DURATION_MINUTES = 15;
export const POSTGRES_INT_MAX = 2_147_483_647;
export const INVENTORY_MIN = 0;

export function assertInventoryInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < INVENTORY_MIN || value > POSTGRES_INT_MAX) {
    throw new RangeError(`${field} is outside PostgreSQL Int capacity.`);
  }
  return value;
}

export function checkedInventoryResult(current: number, delta: number) {
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > POSTGRES_INT_MAX) {
    throw new RangeError("Inventory adjustment delta is outside PostgreSQL Int capacity.");
  }
  return assertInventoryInteger(current + delta, "resultingOnHand");
}

export function reservationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESERVATION_DURATION_MINUTES * 60_000);
}

export function stockMovementKey(parts: {
  action: string;
  orderId?: string;
  reservationId?: string;
  variantId: string;
}): string {
  const canonical = [
    parts.action,
    parts.orderId ?? "none",
    parts.reservationId ?? "none",
    parts.variantId,
  ].join(":");
  return `commerce:${createHash("sha256").update(canonical).digest("hex")}`;
}
