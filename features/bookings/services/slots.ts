import "server-only";

import { TZDate } from "@date-fns/tz";

import { prisma } from "@/lib/db/prisma";
import type {
  BookingSlot,
  BookingSlotResult,
} from "@/features/bookings/types";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  const normalized = new Date(
    Date.UTC(parsed.year, parsed.month, parsed.day),
  );
  if (
    normalized.getUTCFullYear() !== parsed.year ||
    normalized.getUTCMonth() !== parsed.month ||
    normalized.getUTCDate() !== parsed.day
  ) {
    return null;
  }
  return parsed;
}

function atLocalTime(
  date: NonNullable<ReturnType<typeof parseDate>>,
  time: string,
  timezone: string,
): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    new TZDate(
      date.year,
      date.month,
      date.day,
      hour,
      minute,
      timezone,
    ),
  );
}

function overlaps(
  start: Date,
  end: Date,
  occupied: Array<{ startsAt: Date; endsAt: Date }>,
): boolean {
  return occupied.some(
    (interval) => start < interval.endsAt && end > interval.startsAt,
  );
}

export async function getBookingSlotResult(
  branchServiceId: string,
  dateValue: string,
): Promise<BookingSlotResult> {
  const date = parseDate(dateValue);
  if (!date) return { slots: [], reason: "INVALID_DATE" };

  const offering = await prisma.branchService.findUnique({
    where: { id: branchServiceId },
    include: {
      service: {
        include: { staffAssignments: true },
      },
      branch: {
        include: {
          organization: {
            include: { settings: true },
          },
          businessHours: true,
          assignments: {
            include: {
              member: {
                include: {
                  person: true,
                  availabilities: true,
                },
              },
            },
          },
          blockedTimes: true,
          bookings: {
            where: { status: { in: [...ACTIVE_BOOKING_STATUSES] } },
          },
        },
      },
    },
  });
  if (!offering) return { slots: [], reason: "SERVICE_NOT_ASSIGNED" };
  if (!offering.isAvailable || offering.service.status !== "ACTIVE") {
    return { slots: [], reason: "SERVICE_INACTIVE" };
  }
  if (
    offering.branch.deletedAt ||
    offering.branch.status !== "ACTIVE" ||
    offering.branch.organization.deletedAt ||
    !offering.branch.organization.isActive ||
    offering.branch.organization.status !== "ACTIVE" ||
    !offering.branch.organization.settings?.bookingEnabled ||
    !offering.branch.organization.settings.marketplaceVisible
  ) {
    return { slots: [], reason: "OFFERING_UNAVAILABLE" };
  }

  const dayOfWeek = new Date(
    Date.UTC(date.year, date.month, date.day),
  ).getUTCDay();
  const businessHours = offering.branch.businessHours.find(
    (hours) => hours.dayOfWeek === dayOfWeek && hours.isOpen,
  );
  if (!businessHours) {
    return {
      slots: [],
      reason: offering.branch.businessHours.some((hours) => hours.isOpen)
        ? "CLOSED_ON_DATE"
        : "HOURS_NOT_CONFIGURED",
    };
  }

  const timezone = offering.branch.timezone;
  const businessStart = atLocalTime(date, businessHours.openTime, timezone);
  const businessEnd = atLocalTime(date, businessHours.closeTime, timezone);
  const now = new Date();
  const globalBlocks = offering.branch.blockedTimes.filter(
    (blocked) => blocked.memberId === null,
  );
  const slots: BookingSlot[] = [];

  const assignedMemberIds = new Set(
    offering.service.staffAssignments.map((assignment) => assignment.memberId),
  );
  const branchMembers = offering.branch.assignments
    .map((assignment) => assignment.member)
    .filter((member) =>
      member.availabilities.some(
        (availability) =>
          availability.branchId === offering.branchId &&
          availability.dayOfWeek === dayOfWeek &&
          availability.isActive,
      ),
    );
  const unassignedCandidate = {
    id: null,
    person: null,
    availabilities: [],
  } as const;
  const staffMode = offering.service.staffSelectionMode;
  const configuredMembers =
    assignedMemberIds.size > 0
      ? branchMembers.filter((member) => assignedMemberIds.has(member.id))
      : branchMembers;
  const candidates =
    staffMode === "NONE"
      ? [unassignedCandidate]
      : staffMode === "OPTIONAL"
        ? configuredMembers.length > 0
          ? configuredMembers
          : [unassignedCandidate]
        : configuredMembers;

  if (staffMode === "REQUIRED" && candidates.length === 0) {
    const hasConfiguredStaff = offering.branch.assignments.some(
      (assignment) =>
        assignment.member.availabilities.some(
          (availability) =>
            availability.branchId === offering.branchId &&
            availability.isActive,
        ),
    );
    return {
      slots: [],
      reason: hasConfiguredStaff
        ? "STAFF_UNAVAILABLE"
        : "STAFF_NOT_CONFIGURED",
    };
  }

  for (const member of candidates) {
    const availability =
      member.id === null
        ? null
        : member.availabilities.find(
            (item) =>
              item.branchId === offering.branchId &&
              item.dayOfWeek === dayOfWeek &&
              item.isActive,
          );
    const windowStart = availability
      ? new Date(
          Math.max(
            businessStart.getTime(),
            atLocalTime(date, availability.startTime, timezone).getTime(),
          ),
        )
      : businessStart;
    const windowEnd = availability
      ? new Date(
          Math.min(
            businessEnd.getTime(),
            atLocalTime(date, availability.endTime, timezone).getTime(),
          ),
        )
      : businessEnd;
    const occupied = [
      ...globalBlocks,
      ...offering.branch.blockedTimes.filter(
        (blocked) => blocked.memberId === member.id,
      ),
      ...offering.branch.bookings.filter(
        (booking) =>
          member.id === null
            ? booking.memberId === null
            : booking.memberId === member.id,
      ),
    ];

    for (
      let start = windowStart;
      start.getTime() + offering.durationMinutes * 60_000 <= windowEnd.getTime();
      start = new Date(start.getTime() + 15 * 60_000)
    ) {
      const end = new Date(
        start.getTime() + offering.durationMinutes * 60_000,
      );
      if (start <= now || overlaps(start, end, occupied)) continue;
      slots.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        memberId: member.id,
        memberName:
          member.person?.displayName ?? member.person?.firstName ?? null,
      });
    }
  }

  const sortedSlots = slots.sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  return {
    slots: sortedSlots,
    reason: sortedSlots.length > 0 ? "AVAILABLE" : "NO_SLOTS",
  };
}

export async function generateBookingSlots(
  branchServiceId: string,
  dateValue: string,
): Promise<BookingSlot[]> {
  return (await getBookingSlotResult(branchServiceId, dateValue)).slots;
}
