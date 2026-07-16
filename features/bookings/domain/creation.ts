import { createHash } from "node:crypto";

import type { StaffSelectionMode } from "@prisma/client";

import type { BookingSlot } from "@/features/bookings/types";

export interface BookingCreationSelection {
  branchServiceId: string;
  date: string;
  memberId: string | null;
  startsAt: string;
}

export function bookingCreationRequestHash(
  selection: BookingCreationSelection,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        branchServiceId: selection.branchServiceId,
        date: selection.date,
        memberId: selection.memberId,
        startsAt: selection.startsAt,
      }),
    )
    .digest("hex");
}

export function bookingReference(bookingId: string): string {
  return `RZ-${bookingId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function selectBookingSlots(
  slots: readonly BookingSlot[],
  mode: StaffSelectionMode,
  requestedMemberId: string | null,
): BookingSlot[] {
  const sorted = [...slots].sort(
    (left, right) =>
      left.startsAt.localeCompare(right.startsAt) ||
      (left.memberId ?? "").localeCompare(right.memberId ?? ""),
  );

  if (mode === "NONE") {
    return sorted.filter((slot) => slot.memberId === null);
  }

  if (requestedMemberId) {
    return sorted.filter((slot) => slot.memberId === requestedMemberId);
  }

  if (mode === "REQUIRED") return [];

  const automatic = new Map<string, BookingSlot>();
  for (const slot of sorted) {
    if (!automatic.has(slot.startsAt)) {
      automatic.set(slot.startsAt, {
        ...slot,
        memberId: null,
        memberName: null,
      });
    }
  }
  return [...automatic.values()];
}

export function selectionMatchesSlot(
  selection: BookingCreationSelection,
  slot: BookingSlot,
): boolean {
  return (
    selection.startsAt === slot.startsAt && selection.memberId === slot.memberId
  );
}
