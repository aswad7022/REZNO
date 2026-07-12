import { createHash } from "node:crypto";

export const RESERVATION_DURATION_MINUTES = 15;

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
