import type { StoredAssetState, UploadSessionState } from "@prisma/client";

export const PROVIDER_RESIDENT_ASSET_STATES = [
  "PENDING_UPLOAD",
  "UPLOADED",
  "PENDING_INSPECTION",
  "READY",
  "QUARANTINED",
  "REJECTED",
  "DELETE_PENDING",
] as const satisfies readonly StoredAssetState[];

export const ACTIVE_SESSION_RESERVATION_STATES = [
  "CREATED",
  "TARGET_ISSUED",
  "UPLOADED",
] as const satisfies readonly UploadSessionState[];

export function isProviderResidentAssetState(state: StoredAssetState) {
  return (PROVIDER_RESIDENT_ASSET_STATES as readonly StoredAssetState[]).includes(state);
}

export function isActiveSessionReservationState(state: UploadSessionState) {
  return (ACTIVE_SESSION_RESERVATION_STATES as readonly UploadSessionState[]).includes(state);
}

export function sessionReservesPurposeSlot(state: UploadSessionState, expiresAt: Date, now: Date) {
  return isActiveSessionReservationState(state) && expiresAt.getTime() > now.getTime();
}

export function purposeQuotaUsage(stored: number, reserved: number) {
  if (!Number.isSafeInteger(stored) || stored < 0 || !Number.isSafeInteger(reserved) || reserved < 0) {
    throw new Error("Storage purpose quota counts must be non-negative safe integers.");
  }
  return stored + reserved;
}

export function purposeQuotaPermits(input: {
  additionalReservations?: number;
  limit: number;
  reserved: number;
  stored: number;
}) {
  const additionalReservations = input.additionalReservations ?? 0;
  if (!Number.isSafeInteger(additionalReservations) || additionalReservations < 0
    || !Number.isSafeInteger(input.limit) || input.limit < 0) {
    throw new Error("Storage purpose quota limits must be non-negative safe integers.");
  }
  return purposeQuotaUsage(input.stored, input.reserved) + additionalReservations <= input.limit;
}
