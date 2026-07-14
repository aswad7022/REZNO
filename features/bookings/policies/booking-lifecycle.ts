import type {
  BookingChangeRequestStatus,
  BookingStatus,
  SystemRole,
} from "@prisma/client";

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

export const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;
export const FINAL_BOOKING_STATUSES = [
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;
export const CUSTOMER_CANCELLATION_STATUSES = ACTIVE_BOOKING_STATUSES;
export const CUSTOMER_RESCHEDULE_STATUSES = ACTIVE_BOOKING_STATUSES;
export const BOOKING_CHANGE_REQUEST_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
] as const satisfies readonly BookingChangeRequestStatus[];

export type CustomerBookingTab =
  | "all"
  | "upcoming"
  | "completed"
  | "cancelled";

export function isActiveBookingStatus(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(
    status as (typeof ACTIVE_BOOKING_STATUSES)[number],
  );
}

export function isFinalBookingStatus(status: BookingStatus): boolean {
  return FINAL_BOOKING_STATUSES.includes(
    status as (typeof FINAL_BOOKING_STATUSES)[number],
  );
}

export function isCompletedBooking(status: BookingStatus): boolean {
  return status === "COMPLETED";
}

export function customerBookingTabMatches(
  tab: CustomerBookingTab,
  booking: { startsAt: Date; status: BookingStatus },
  now = new Date(),
): boolean {
  if (tab === "all") return true;
  if (tab === "upcoming") {
    return isActiveBookingStatus(booking.status) && booking.startsAt >= now;
  }
  if (tab === "completed") return isCompletedBooking(booking.status);
  return booking.status === "CANCELLED";
}

export function bookingCancellationDeadline(
  startsAt: Date,
  cancellationWindowHours: number | null | undefined,
): Date {
  const hours = cancellationWindowHours ?? 24;
  return new Date(startsAt.getTime() - hours * 3_600_000);
}

export function canCustomerCancelBooking(
  booking: {
    startsAt: Date;
    status: BookingStatus;
    cancellationWindowHours?: number | null;
  },
  now = new Date(),
): boolean {
  return (
    isActiveBookingStatus(booking.status) &&
    now <
      bookingCancellationDeadline(
        booking.startsAt,
        booking.cancellationWindowHours,
      )
  );
}

export function canCustomerRequestBookingChange(
  booking: {
    startsAt: Date;
    status: BookingStatus;
    cancellationWindowHours?: number | null;
  },
  now = new Date(),
): boolean {
  return canCustomerCancelBooking(booking, now);
}

export function isCustomerInitiatedChangeRequest(request: {
  requestedByPersonId: string;
  customerId: string;
}): boolean {
  return request.requestedByPersonId === request.customerId;
}

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
