import "server-only";

import { selectBookingSlots } from "@/features/bookings/domain/creation";
import { bookingDomainError } from "@/features/bookings/domain/errors";
import { getPublicOfferingStaff } from "@/features/bookings/services/booking-catalog";
import { getBookingSlotResult } from "@/features/bookings/services/slots";
import { prisma } from "@/lib/db/prisma";

export async function getPublicBookingAvailability(input: {
  branchServiceId: string;
  date: string;
  memberId: string | null;
}) {
  const offering = await prisma.branchService.findFirst({
    where: {
      id: input.branchServiceId,
      isAvailable: true,
      service: { deletedAt: null, status: "ACTIVE" },
      branch: {
        deletedAt: null,
        status: "ACTIVE",
        organization: {
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
          settings: { bookingEnabled: true, marketplaceVisible: true },
        },
      },
    },
    select: {
      branch: { select: { organizationId: true, timezone: true } },
      service: {
        select: { organizationId: true, staffSelectionMode: true },
      },
    },
  });
  if (!offering) {
    bookingDomainError("NOT_FOUND", "Service offering was not found.");
  }
  if (offering.branch.organizationId !== offering.service.organizationId) {
    bookingDomainError(
      "SERVICE_UNAVAILABLE",
      "Service and branch do not belong to the same business.",
    );
  }

  const mode = offering.service.staffSelectionMode;
  if (mode === "REQUIRED" && !input.memberId) {
    bookingDomainError("STAFF_REQUIRED", "A staff member must be selected.");
  }
  if (mode === "NONE" && input.memberId) {
    bookingDomainError("STAFF_UNAVAILABLE", "This service does not accept staff selection.");
  }

  if (input.memberId) {
    const staff = await getPublicOfferingStaff(input.branchServiceId);
    if (!staff.staff.some((member) => member.id === input.memberId)) {
      bookingDomainError("STAFF_UNAVAILABLE", "Staff member is not eligible for this service.");
    }
  }

  const result = await getBookingSlotResult(input.branchServiceId, input.date);
  return {
    date: input.date,
    timezone: offering.branch.timezone,
    staffSelectionMode: mode,
    reason: result.reason,
    slots: selectBookingSlots(result.slots, mode, input.memberId),
  };
}
