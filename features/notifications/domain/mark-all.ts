import { notificationError } from "@/features/notifications/domain/errors";

export function assertMarkAllSnapshotCurrent(snapshot: Date, authoritativeNow: Date) {
  if (Number.isNaN(snapshot.getTime()) || Number.isNaN(authoritativeNow.getTime()) || snapshot > authoritativeNow) {
    notificationError("VALIDATION_ERROR", "Mark-all snapshot cannot be in the future.");
  }
}
