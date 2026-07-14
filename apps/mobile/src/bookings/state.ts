import type {
  MobileBookingBranch,
  MobileBookingService,
  MobileBookingSlot,
} from "../types/bookings";

export type MobileBookingStep =
  | "business"
  | "service"
  | "branch"
  | "staff"
  | "datetime"
  | "review"
  | "detail";

export type MobileBookingSelection = {
  service: MobileBookingService | null;
  branch: MobileBookingBranch | null;
  memberId: string | null;
  date: string | null;
  slot: MobileBookingSlot | null;
};

export const EMPTY_BOOKING_SELECTION: MobileBookingSelection = {
  service: null,
  branch: null,
  memberId: null,
  date: null,
  slot: null,
};

const SLOT_RECOVERY_CODES = new Set([
  "SLOT_CONFLICT",
  "SLOT_UNAVAILABLE",
  "STAFF_UNAVAILABLE",
]);
const AUTH_RECOVERY_CODES = new Set([
  "UNAUTHENTICATED",
  "PROFILE_INCOMPLETE",
  "PROFILE_UNAVAILABLE",
]);

export function mobileBookingFailureRecovery(code: string | undefined) {
  return {
    requiresAuthentication: code ? AUTH_RECOVERY_CODES.has(code) : false,
    returnToSlots: code ? SLOT_RECOVERY_CODES.has(code) : false,
  };
}

export function createMobileBookingSubmissionGate() {
  let inFlight = false;
  return {
    finish() {
      inFlight = false;
    },
    tryBegin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
  };
}

export function selectMobileBookingService(
  current: MobileBookingSelection,
  service: MobileBookingService,
): MobileBookingSelection {
  return { ...current, service, branch: null, memberId: null, date: null, slot: null };
}

export function selectMobileBookingBranch(
  current: MobileBookingSelection,
  branch: MobileBookingBranch,
): MobileBookingSelection {
  return { ...current, branch, memberId: null, date: null, slot: null };
}

export function selectMobileBookingStaff(
  current: MobileBookingSelection,
  memberId: string | null,
): MobileBookingSelection {
  return { ...current, memberId, date: null, slot: null };
}

export function selectMobileBookingDate(
  current: MobileBookingSelection,
  date: string,
): MobileBookingSelection {
  return { ...current, date, slot: null };
}

export function selectMobileBookingSlot(
  current: MobileBookingSelection,
  slot: MobileBookingSlot,
): MobileBookingSelection {
  return { ...current, slot };
}

export function canReviewMobileBooking(selection: MobileBookingSelection) {
  if (!selection.service || !selection.branch || !selection.date || !selection.slot) {
    return false;
  }
  if (
    selection.branch.staffSelectionMode === "REQUIRED" &&
    !selection.memberId
  ) {
    return false;
  }
  return selection.slot.memberId === selection.memberId || selection.memberId === null;
}

export function nextBookingDates(
  timezone: string,
  count = 14,
  now = new Date(),
) {
  const values: string[] = [];
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localToday = formatter.format(now);
  const [year, month, day] = localToday.split("-").map(Number);
  const calendarStart = Date.UTC(year!, month! - 1, day!);
  for (let offset = 0; offset < count; offset += 1) {
    values.push(
      new Date(calendarStart + offset * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  }
  return [...new Set(values)];
}
