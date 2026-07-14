import type { BookingStatus, SystemRole } from "@prisma/client";

import { canOperateBookings as canOperateBookingsFromIdentityPolicy } from "@/features/identity/policies/authorization";
import type { BookingLifecycleStatus } from "@/features/bookings/types";

const transitions: Readonly<
  Record<BookingStatus, readonly BookingLifecycleStatus[]>
> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

export function canOperateBookings(systemRole: SystemRole | null): boolean {
  return canOperateBookingsFromIdentityPolicy(systemRole);
}

export function canTransitionBooking(
  current: BookingStatus,
  next: BookingLifecycleStatus,
): boolean {
  return transitions[current].includes(next);
}

export function getAvailableTransitions(
  current: BookingStatus,
): readonly BookingLifecycleStatus[] {
  return transitions[current];
}
