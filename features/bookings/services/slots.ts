import "server-only";

import { TZDate } from "@date-fns/tz";

import { parseBookingDate } from "@/features/bookings/domain/date";
import {
  activeServiceStaffAssignmentMemberIds,
  activeServiceStaffAssignmentWhere,
  serviceStaffAssignmentPolicySelect,
  serviceStaffPolicyAllowsMember,
} from "@/features/bookings/domain/staff-assignment-policy";
import { prisma } from "@/lib/db/prisma";
import type {
  BookingSlot,
  BookingSlotResult,
} from "@/features/bookings/types";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

function atLocalTime(
  date: NonNullable<ReturnType<typeof parseBookingDate>>,
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
  const date = parseBookingDate(dateValue);
  if (!date) return { slots: [], reason: "INVALID_DATE" };

  const offering = await prisma.branchService.findUnique({
    where: { id: branchServiceId },
    include: {
      service: {
        include: {
          staffAssignments: {
            where: activeServiceStaffAssignmentWhere,
            select: serviceStaffAssignmentPolicySelect,
          },
        },
      },
      branch: {
        include: {
          organization: {
            include: { settings: true },
          },
          businessHours: true,
          assignments: {
            where: {
              member: {
                deletedAt: null,
                status: "ACTIVE",
                person: { deletedAt: null, status: "ACTIVE" },
              },
            },
            include: {
              member: {
                include: {
                  person: true,
                  availabilities: { where: { isActive: true } },
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
  if (offering.service.organizationId !== offering.branch.organizationId) {
    return { slots: [], reason: "OFFERING_UNAVAILABLE" };
  }
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

  const timezone = offering.branch.timezone;
  let today: NonNullable<ReturnType<typeof parseBookingDate>>;
  try {
    const todayValue = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const parsedToday = parseBookingDate(todayValue);
    if (!parsedToday) return { slots: [], reason: "OFFERING_UNAVAILABLE" };
    today = parsedToday;
  } catch {
    return { slots: [], reason: "OFFERING_UNAVAILABLE" };
  }
  const selectedDay = Date.UTC(date.year, date.month, date.day);
  const currentDay = Date.UTC(today.year, today.month, today.day);
  if (selectedDay < currentDay || selectedDay > currentDay + 90 * 86_400_000) {
    return { slots: [], reason: "DATE_OUT_OF_RANGE" };
  }
  const dayOfWeek = new Date(selectedDay).getUTCDay();
  const businessHours = offering.branch.businessHours.find(
    (hours) => hours.dayOfWeek === dayOfWeek && hours.isOpen,
  );
  if (!businessHours) {
    return {
      slots: [],
      reason: offering.branch.businessHours.length > 0
        ? "CLOSED_ON_DATE"
        : "HOURS_NOT_CONFIGURED",
    };
  }
  const businessStart = atLocalTime(date, businessHours.openTime, timezone);
  const businessEnd = atLocalTime(date, businessHours.closeTime, timezone);
  const now = new Date();
  const globalBlocks = offering.branch.blockedTimes.filter(
    (blocked) => blocked.memberId === null,
  );
  const slotsByKey = new Map<string, BookingSlot>();

  const assignedMemberIds = activeServiceStaffAssignmentMemberIds({
    assignments: offering.service.staffAssignments,
    organizationId: offering.service.organizationId,
    serviceId: offering.service.id,
  });
  const branchMembers = offering.branch.assignments
    .map((assignment) => assignment.member)
    .filter(
      (member) =>
        member.organizationId === offering.service.organizationId &&
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
      ? branchMembers.filter((member) =>
          serviceStaffPolicyAllowsMember(assignedMemberIds, member.id),
        )
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
        assignment.member.organizationId ===
          offering.service.organizationId &&
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
    const availabilityWindows =
      member.id === null
        ? []
        : member.availabilities.filter(
            (item) =>
              item.branchId === offering.branchId &&
              item.dayOfWeek === dayOfWeek &&
              item.isActive,
          );
    const windows =
      member.id === null
        ? [{ start: businessStart, end: businessEnd }]
        : availabilityWindows.map((availability) => ({
            start: new Date(
              Math.max(
                businessStart.getTime(),
                atLocalTime(date, availability.startTime, timezone).getTime(),
              ),
            ),
            end: new Date(
              Math.min(
                businessEnd.getTime(),
                atLocalTime(date, availability.endTime, timezone).getTime(),
              ),
            ),
          }));
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

    for (const window of windows) {
      for (
        let start = window.start;
        start.getTime() + offering.durationMinutes * 60_000 <= window.end.getTime();
        start = new Date(start.getTime() + 15 * 60_000)
      ) {
        const end = new Date(
          start.getTime() + offering.durationMinutes * 60_000,
        );
        if (start <= now || overlaps(start, end, occupied)) continue;
        const slot = {
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          memberId: member.id,
          memberName:
            member.person?.displayName ?? member.person?.firstName ?? null,
        };
        slotsByKey.set(`${slot.startsAt}:${slot.memberId ?? "none"}`, slot);
      }
    }
  }

  const sortedSlots = [...slotsByKey.values()].sort((a, b) =>
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
