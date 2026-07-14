import "server-only";

import { TZDate } from "@date-fns/tz";
import { Prisma, type BookingStatus } from "@prisma/client";

import { parseBookingDate } from "@/features/bookings/domain/date";
import {
  cancellationRequestHash,
  changeRequestHash,
  customerBookingCursorWhere,
  customerBookingOrder,
  customerBookingTabWhere,
  decodeCustomerBookingCursor,
  DEFAULT_CUSTOMER_BOOKING_PAGE_SIZE,
  encodeCustomerBookingCursor,
  MAX_CUSTOMER_BOOKING_PAGE_SIZE,
} from "@/features/bookings/domain/management";
import { bookingDomainError } from "@/features/bookings/domain/errors";
import {
  activeServiceStaffAssignmentMemberIds,
  activeServiceStaffAssignmentWhere,
  serviceStaffAssignmentPolicySelect,
  serviceStaffPolicyAllowsMember,
  type ServiceStaffAssignmentPolicyRecord,
} from "@/features/bookings/domain/staff-assignment-policy";
import {
  ACTIVE_BOOKING_STATUSES,
  bookingCancellationDeadline,
  canCustomerCancelBooking,
  canCustomerRequestBookingChange,
  type CustomerBookingTab,
} from "@/features/bookings/policies/booking-lifecycle";
import { getPublicBookingAvailability } from "@/features/bookings/services/booking-availability";
import type {
  CustomerBookingChangeRequest,
  CustomerBookingManagementDetail,
  CustomerBookingManagementItem,
  CustomerBookingPage,
} from "@/features/bookings/types";
import { bookingReference } from "@/features/bookings/domain/creation";
import { prisma } from "@/lib/db/prisma";

const MAX_SERIALIZABLE_ATTEMPTS = 4;

const managementInclude = Prisma.validator<Prisma.BookingInclude>()({
  branch: true,
  member: { include: { person: true } },
  organization: { include: { settings: true } },
  changeRequests: {
    include: { proposedMember: { include: { person: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  },
});

type ManagementBooking = Prisma.BookingGetPayload<{
  include: typeof managementInclude;
}>;

function serializeChangeRequest(
  booking: ManagementBooking,
): CustomerBookingChangeRequest | null {
  const request = booking.changeRequests[0];
  if (!request) return null;
  return {
    id: request.id,
    direction:
      request.requestedByPersonId === booking.customerId
        ? "CUSTOMER_TO_BUSINESS"
        : "BUSINESS_TO_CUSTOMER",
    status: request.status,
    proposedStartsAt: request.proposedStartsAt.toISOString(),
    proposedEndsAt: request.proposedEndsAt.toISOString(),
    proposedMemberName:
      request.proposedMember?.person.displayName ??
      request.proposedMember?.person.firstName ??
      null,
    createdAt: request.createdAt.toISOString(),
    respondedAt: request.respondedAt?.toISOString() ?? null,
  };
}

function serializeManagementItem(
  booking: ManagementBooking,
  now = new Date(),
): CustomerBookingManagementItem {
  const cancellationWindowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  return {
    id: booking.id,
    reference: bookingReference(booking.id),
    businessName: booking.organization.name,
    branchName: booking.branch.name,
    serviceName: booking.serviceNameSnapshot,
    memberName:
      booking.member?.person.displayName ?? booking.member?.person.firstName ?? null,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    timezone: booking.branch.timezone,
    price: booking.priceSnapshot.toString(),
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
    cancellation: {
      eligible: canCustomerCancelBooking(
        {
          status: booking.status,
          startsAt: booking.startsAt,
          cancellationWindowHours,
        },
        now,
      ),
      deadline: bookingCancellationDeadline(
        booking.startsAt,
        cancellationWindowHours,
      ).toISOString(),
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    },
    changeRequest: serializeChangeRequest(booking),
  };
}

export async function listCustomerBookings(input: {
  customerId: string;
  tab: CustomerBookingTab;
  cursor?: string | null;
  limit?: number;
}): Promise<CustomerBookingPage> {
  await assertActiveCustomer(input.customerId);
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_CUSTOMER_BOOKING_PAGE_SIZE, 1),
    MAX_CUSTOMER_BOOKING_PAGE_SIZE,
  );
  const decoded = input.cursor
    ? decodeCustomerBookingCursor(input.cursor, input.tab)
    : null;
  const snapshotAt = decoded ? new Date(decoded.snapshotAt) : new Date();
  const baseWhere: Prisma.BookingWhereInput = {
    customerId: input.customerId,
    restaurantReservation: null,
  };
  const tabWhere = customerBookingTabWhere(input.tab, snapshotAt);
  const [rows, all, upcoming, completed, cancelled] = await Promise.all([
    prisma.booking.findMany({
      where: {
        AND: [
          baseWhere,
          tabWhere,
          ...(decoded ? [customerBookingCursorWhere(decoded)] : []),
        ],
      },
      include: managementInclude,
      orderBy: [...customerBookingOrder(input.tab)],
      take: limit + 1,
    }),
    prisma.booking.count({ where: baseWhere }),
    prisma.booking.count({
      where: { AND: [baseWhere, customerBookingTabWhere("upcoming", snapshotAt)] },
    }),
    prisma.booking.count({
      where: { AND: [baseWhere, customerBookingTabWhere("completed", snapshotAt)] },
    }),
    prisma.booking.count({
      where: { AND: [baseWhere, customerBookingTabWhere("cancelled", snapshotAt)] },
    }),
  ]);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((booking) => serializeManagementItem(booking, snapshotAt)),
    nextCursor:
      hasMore && last
        ? encodeCustomerBookingCursor({
            tab: input.tab,
            startsAt: last.startsAt.toISOString(),
            id: last.id,
            snapshotAt: snapshotAt.toISOString(),
          })
        : null,
    counts: { all, upcoming, completed, cancelled },
  };
}

export async function getCustomerBookingManagementDetail(
  customerId: string,
  bookingId: string,
): Promise<CustomerBookingManagementDetail | null> {
  await assertActiveCustomer(customerId);
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId, restaurantReservation: null },
    include: {
      ...managementInclude,
      statusHistory: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          createdAt: true,
        },
      },
    },
  });
  if (!booking) return null;
  const item = serializeManagementItem(booking);
  const cancellationWindowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  return {
    ...item,
    branchServiceId: booking.branchServiceId,
    memberId: booking.memberId,
    cancellation: {
      ...item.cancellation,
      reason: booking.cancellationReason,
    },
    reschedule: {
      eligible: canCustomerRequestBookingChange({
        status: booking.status,
        startsAt: booking.startsAt,
        cancellationWindowHours,
      }),
    },
    statusHistory: booking.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function getCustomerRescheduleOptions(input: {
  customerId: string;
  bookingId: string;
  date: string;
  memberId: string | null;
}) {
  await assertActiveCustomer(input.customerId);
  const booking = await prisma.booking.findFirst({
    where: {
      id: input.bookingId,
      customerId: input.customerId,
      restaurantReservation: null,
    },
    include: { organization: { include: { settings: true } } },
  });
  if (!booking) bookingDomainError("NOT_FOUND", "Booking was not found.");
  if (
    !canCustomerRequestBookingChange({
      status: booking.status,
      startsAt: booking.startsAt,
      cancellationWindowHours:
        booking.organization.settings?.cancellationWindowHours,
    })
  ) {
    bookingDomainError(
      "BOOKING_NOT_RESCHEDULABLE",
      "Booking is not eligible for a change request.",
    );
  }
  const availability = await getPublicBookingAvailability({
    branchServiceId: booking.branchServiceId,
    date: input.date,
    memberId: input.memberId,
  });
  return {
    ...availability,
    slots: availability.slots.filter(
      (slot) =>
        slot.startsAt !== booking.startsAt.toISOString() ||
        slot.memberId !== booking.memberId,
    ),
  };
}

export async function cancelCustomerBookingPersisted(input: {
  customerId: string;
  bookingId: string;
  idempotencyKey: string;
  reason: string | null;
}) {
  await assertActiveCustomer(input.customerId);
  const requestHash = cancellationRequestHash(input);
  const replay = await replayCancellation(input, requestHash);
  if (replay) return replay;

  return serializableMutation(async (transaction) => {
    const customer = await transaction.person.findFirst({
      where: {
        id: input.customerId,
        deletedAt: null,
        isOnboarded: true,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!customer) {
      bookingDomainError(
        "CUSTOMER_UNAVAILABLE",
        "An active, onboarded customer profile is required.",
      );
    }
    const booking = await transaction.booking.findFirst({
      where: {
        id: input.bookingId,
        customerId: input.customerId,
        restaurantReservation: null,
      },
      include: { organization: { include: { settings: true } } },
    });
    if (!booking) bookingDomainError("NOT_FOUND", "Booking was not found.");
    if (booking.customerCancellationIdempotencyKey) {
      if (
        booking.customerCancellationIdempotencyKey === input.idempotencyKey &&
        booking.customerCancellationRequestHash === requestHash
      ) {
        return { bookingId: booking.id, replayed: true };
      }
      bookingDomainError(
        "BOOKING_STATE_CONFLICT",
        "Booking has already been cancelled or changed.",
      );
    }
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status as "PENDING" | "CONFIRMED")) {
      bookingDomainError(
        "BOOKING_NOT_CANCELLABLE",
        "Booking status does not allow customer cancellation.",
      );
    }
    const deadline = bookingCancellationDeadline(
      booking.startsAt,
      booking.organization.settings?.cancellationWindowHours,
    );
    if (new Date() >= deadline) {
      bookingDomainError(
        "CANCELLATION_DEADLINE_PASSED",
        "The customer cancellation deadline has passed.",
        { deadline: deadline.toISOString() },
      );
    }
    const cancelledAt = new Date();
    const changed = await transaction.booking.updateMany({
      where: {
        id: booking.id,
        customerId: input.customerId,
        status: booking.status,
        customerCancellationIdempotencyKey: null,
      },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancellationReason: input.reason,
        customerCancellationIdempotencyKey: input.idempotencyKey,
        customerCancellationRequestHash: requestHash,
      },
    });
    if (changed.count !== 1) {
      bookingDomainError(
        "BOOKING_STATE_CONFLICT",
        "Booking changed while cancellation was being processed.",
      );
    }
    await transaction.bookingChangeRequest.updateMany({
      where: { bookingId: booking.id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: cancelledAt },
    });
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: "CANCELLED",
        changedByPersonId: input.customerId,
        note: input.reason,
      },
    });
    return { bookingId: booking.id, replayed: false };
  });
}

async function replayCancellation(
  input: {
    customerId: string;
    bookingId: string;
    idempotencyKey: string;
  },
  requestHash: string,
) {
  const existing = await prisma.booking.findFirst({
    where: {
      customerId: input.customerId,
      customerCancellationIdempotencyKey: input.idempotencyKey,
    },
    select: { id: true, customerCancellationRequestHash: true },
  });
  if (!existing) return null;
  if (
    existing.id !== input.bookingId ||
    existing.customerCancellationRequestHash !== requestHash
  ) {
    bookingDomainError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used for another cancellation request.",
    );
  }
  return { bookingId: existing.id, replayed: true };
}

export async function requestCustomerBookingChange(input: {
  customerId: string;
  bookingId: string;
  idempotencyKey: string;
  date: string;
  memberId: string | null;
  startsAt: string;
}) {
  await assertActiveCustomer(input.customerId);
  const requestHash = changeRequestHash(input);
  const replay = await replayChangeRequest(input, requestHash);
  if (replay) return replay;

  const booking = await prisma.booking.findFirst({
    where: {
      id: input.bookingId,
      customerId: input.customerId,
      restaurantReservation: null,
    },
    include: { organization: { include: { settings: true } } },
  });
  if (!booking) bookingDomainError("NOT_FOUND", "Booking was not found.");
  if (
    !canCustomerRequestBookingChange({
      status: booking.status,
      startsAt: booking.startsAt,
      cancellationWindowHours:
        booking.organization.settings?.cancellationWindowHours,
    })
  ) {
    bookingDomainError(
      "BOOKING_NOT_RESCHEDULABLE",
      "Booking is not eligible for a change request.",
    );
  }
  const availability = await getPublicBookingAvailability({
    branchServiceId: booking.branchServiceId,
    date: input.date,
    memberId: input.memberId,
  });
  const selected = availability.slots.find(
    (slot) =>
      slot.startsAt === input.startsAt && slot.memberId === input.memberId,
  );
  if (!selected) {
    bookingDomainError(
      "SLOT_UNAVAILABLE",
      "Selected change-request slot is no longer available.",
    );
  }

  try {
    return await serializableMutation(async (transaction) => {
      const customer = await transaction.person.findFirst({
        where: {
          id: input.customerId,
          deletedAt: null,
          isOnboarded: true,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!customer) {
        bookingDomainError(
          "CUSTOMER_UNAVAILABLE",
          "An active, onboarded customer profile is required.",
        );
      }
      const current = await transaction.booking.findFirst({
        where: {
          id: input.bookingId,
          customerId: input.customerId,
          restaurantReservation: null,
        },
        include: {
          branch: { include: { businessHours: true, organization: true } },
          branchService: {
            include: {
              service: {
                include: {
                  staffAssignments: {
                    where: activeServiceStaffAssignmentWhere,
                    select: serviceStaffAssignmentPolicySelect,
                  },
                },
              },
            },
          },
          organization: { include: { settings: true } },
        },
      });
      if (!current) bookingDomainError("NOT_FOUND", "Booking was not found.");
      if (
        !canCustomerRequestBookingChange({
          status: current.status,
          startsAt: current.startsAt,
          cancellationWindowHours:
            current.organization.settings?.cancellationWindowHours,
        })
      ) {
        bookingDomainError(
          "BOOKING_NOT_RESCHEDULABLE",
          "Booking is not eligible for a change request.",
        );
      }
      const existing = await transaction.bookingChangeRequest.findFirst({
        where: { bookingId: current.id, status: "PENDING" },
        select: { id: true },
      });
      if (existing) {
        bookingDomainError(
          "ACTIVE_CHANGE_REQUEST_EXISTS",
          "Booking already has a pending change request.",
        );
      }
      const proposedStartsAt = new Date(selected.startsAt);
      const proposedEndsAt = new Date(selected.endsAt);
      if (
        proposedStartsAt.getTime() === current.startsAt.getTime() &&
        input.memberId === current.memberId
      ) {
        bookingDomainError(
          "INVALID_REQUEST",
          "Requested booking time and staff are unchanged.",
        );
      }
      await assertChangeSlotAvailable(transaction, current, {
        date: input.date,
        memberId: input.memberId,
        startsAt: proposedStartsAt,
        endsAt: proposedEndsAt,
      });
      const created = await transaction.bookingChangeRequest.create({
        data: {
          bookingId: current.id,
          requestedByPersonId: input.customerId,
          proposedMemberId: input.memberId,
          proposedStartsAt,
          proposedEndsAt,
          creationIdempotencyKey: input.idempotencyKey,
          creationRequestHash: requestHash,
          bookingUpdatedAtSnapshot: current.updatedAt,
        },
      });
      return { requestId: created.id, status: created.status, replayed: false };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replayAfterRace = await replayChangeRequest(input, requestHash);
      if (replayAfterRace) return replayAfterRace;
    }
    throw error;
  }
}

async function replayChangeRequest(
  input: {
    customerId: string;
    bookingId: string;
    idempotencyKey: string;
  },
  requestHash: string,
) {
  const existing = await prisma.bookingChangeRequest.findFirst({
    where: {
      requestedByPersonId: input.customerId,
      creationIdempotencyKey: input.idempotencyKey,
    },
    select: { id: true, bookingId: true, creationRequestHash: true, status: true },
  });
  if (!existing) return null;
  if (
    existing.bookingId !== input.bookingId ||
    existing.creationRequestHash !== requestHash
  ) {
    bookingDomainError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used for another change request.",
    );
  }
  return { requestId: existing.id, status: existing.status, replayed: true };
}

export async function respondToCustomerBookingChange(input: {
  requestId: string;
  organizationId: string;
  responderPersonId: string;
  decision: "accept" | "reject";
}) {
  return serializableMutation(async (transaction) => {
    const request = await transaction.bookingChangeRequest.findFirst({
      where: {
        id: input.requestId,
        status: "PENDING",
        booking: {
          organizationId: input.organizationId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
        },
      },
      include: {
        booking: {
          include: {
            branch: { include: { businessHours: true, organization: true } },
            branchService: {
              include: {
                service: {
                  include: {
                    staffAssignments: {
                      where: activeServiceStaffAssignmentWhere,
                      select: serviceStaffAssignmentPolicySelect,
                    },
                  },
                },
              },
            },
            organization: { include: { settings: true } },
          },
        },
      },
    });
    if (
      !request ||
      request.requestedByPersonId !== request.booking.customerId
    ) {
      bookingDomainError(
        "CHANGE_REQUEST_NOT_RESPONDABLE",
        "Customer change request was not found or is no longer pending.",
      );
    }
    if (input.decision === "reject") {
      const rejected = await transaction.bookingChangeRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED", respondedAt: new Date() },
      });
      if (rejected.count !== 1) {
        bookingDomainError(
          "BOOKING_STATE_CONFLICT",
          "Change request was answered concurrently.",
        );
      }
      return { requestId: request.id, status: "REJECTED" as const };
    }
    if (
      !request.bookingUpdatedAtSnapshot ||
      request.booking.updatedAt.getTime() !==
        request.bookingUpdatedAtSnapshot.getTime()
    ) {
      bookingDomainError(
        "BOOKING_STATE_CONFLICT",
        "Booking changed after this request was created.",
      );
    }
    const date = localDateForInstant(
      request.proposedStartsAt,
      request.booking.branch.timezone,
    );
    await assertChangeSlotAvailable(transaction, request.booking, {
      date,
      memberId: request.proposedMemberId,
      startsAt: request.proposedStartsAt,
      endsAt: request.proposedEndsAt,
    });
    const changed = await transaction.booking.updateMany({
      where: {
        id: request.booking.id,
        organizationId: input.organizationId,
        status: request.booking.status,
        updatedAt: request.bookingUpdatedAtSnapshot,
      },
      data: {
        startsAt: request.proposedStartsAt,
        endsAt: request.proposedEndsAt,
        memberId: request.proposedMemberId,
      },
    });
    if (changed.count !== 1) {
      bookingDomainError(
        "BOOKING_STATE_CONFLICT",
        "Booking changed while the request was being approved.",
      );
    }
    const accepted = await transaction.bookingChangeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    if (accepted.count !== 1) {
      bookingDomainError(
        "BOOKING_STATE_CONFLICT",
        "Change request was answered concurrently.",
      );
    }
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: request.booking.id,
        fromStatus: request.booking.status,
        toStatus: request.booking.status,
        changedByPersonId: input.responderPersonId,
        note: "CUSTOMER_CHANGE_ACCEPTED",
      },
    });
    return { requestId: request.id, status: "ACCEPTED" as const };
  });
}

async function assertChangeSlotAvailable(
  transaction: Prisma.TransactionClient,
  booking: {
    id: string;
    branchId: string;
    branchServiceId: string;
    organizationId: string;
    branch: {
      timezone: string;
      deletedAt: Date | null;
      status: string;
      businessHours: Array<{
        dayOfWeek: number;
        isOpen: boolean;
        openTime: string;
        closeTime: string;
      }>;
      organization: {
        id: string;
        deletedAt: Date | null;
        isActive: boolean;
        status: string;
        vertical: string;
      };
    };
    branchService: {
      id: string;
      isAvailable: boolean;
      durationMinutes: number;
      service: {
        id: string;
        organizationId: string;
        status: string;
        staffSelectionMode: string;
        staffAssignments: Array<ServiceStaffAssignmentPolicyRecord>;
      };
    };
  },
  proposed: {
    date: string;
    memberId: string | null;
    startsAt: Date;
    endsAt: Date;
  },
) {
  const { branch, branchService } = booking;
  if (
    branch.deletedAt ||
    branch.status !== "ACTIVE" ||
    branch.organization.deletedAt ||
    !branch.organization.isActive ||
    branch.organization.status !== "ACTIVE" ||
    branch.organization.id !== booking.organizationId ||
    branch.organization.vertical === "RESTAURANT" ||
    branch.organization.vertical === "CAFE" ||
    !branchService.isAvailable ||
    branchService.id !== booking.branchServiceId ||
    branchService.service.status !== "ACTIVE" ||
    branchService.service.organizationId !== booking.organizationId
  ) {
    bookingDomainError(
      "BUSINESS_UNAVAILABLE",
      "Business, branch, or service is unavailable for booking changes.",
    );
  }
  const parsedDate = parseBookingDate(proposed.date);
  if (
    !parsedDate ||
    proposed.startsAt <= new Date() ||
    proposed.endsAt.getTime() - proposed.startsAt.getTime() !==
      branchService.durationMinutes * 60_000 ||
    localDateForInstant(proposed.startsAt, branch.timezone) !== proposed.date
  ) {
    bookingDomainError("SLOT_UNAVAILABLE", "Requested time is invalid.");
  }
  const dayOfWeek = new Date(
    Date.UTC(parsedDate.year, parsedDate.month, parsedDate.day),
  ).getUTCDay();
  const hours = branch.businessHours.find(
    (candidate) => candidate.dayOfWeek === dayOfWeek && candidate.isOpen,
  );
  if (
    !hours ||
    proposed.startsAt <
      atLocalTime(parsedDate, hours.openTime, branch.timezone) ||
    proposed.endsAt > atLocalTime(parsedDate, hours.closeTime, branch.timezone)
  ) {
    bookingDomainError(
      "SLOT_UNAVAILABLE",
      "Requested time is outside branch hours.",
    );
  }
  const mode = branchService.service.staffSelectionMode;
  if (mode === "REQUIRED" && !proposed.memberId) {
    bookingDomainError("STAFF_REQUIRED", "A staff member is required.");
  }
  if (mode === "NONE" && proposed.memberId) {
    bookingDomainError(
      "STAFF_UNAVAILABLE",
      "This service does not accept staff selection.",
    );
  }
  if (proposed.memberId) {
    const member = await transaction.organizationMember.findFirst({
      where: {
        id: proposed.memberId,
        organizationId: booking.organizationId,
        deletedAt: null,
        status: "ACTIVE",
        person: { deletedAt: null, status: "ACTIVE" },
        assignments: { some: { branchId: booking.branchId } },
      },
      include: {
        availabilities: {
          where: { branchId: booking.branchId, dayOfWeek, isActive: true },
        },
      },
    });
    const assigned = serviceStaffPolicyAllowsMember(
      activeServiceStaffAssignmentMemberIds({
        assignments: branchService.service.staffAssignments,
        organizationId: branchService.service.organizationId,
        serviceId: branchService.service.id,
      }),
      proposed.memberId,
    );
    const available = member?.availabilities.some(
      (window) =>
        proposed.startsAt >=
          atLocalTime(parsedDate, window.startTime, branch.timezone) &&
        proposed.endsAt <=
          atLocalTime(parsedDate, window.endTime, branch.timezone),
    );
    if (!member || !assigned || !available) {
      bookingDomainError(
        "STAFF_UNAVAILABLE",
        "Staff member is unavailable for this service and time.",
      );
    }
  }
  const [conflict, blocked] = await Promise.all([
    transaction.booking.findFirst({
      where: {
        id: { not: booking.id },
        branchId: booking.branchId,
        memberId: proposed.memberId,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        startsAt: { lt: proposed.endsAt },
        endsAt: { gt: proposed.startsAt },
      },
      select: { id: true },
    }),
    transaction.blockedTime.findFirst({
      where: {
        branchId: booking.branchId,
        OR: [
          { memberId: null },
          ...(proposed.memberId ? [{ memberId: proposed.memberId }] : []),
        ],
        startsAt: { lt: proposed.endsAt },
        endsAt: { gt: proposed.startsAt },
      },
      select: { id: true },
    }),
  ]);
  if (conflict || blocked) {
    bookingDomainError(
      "SLOT_CONFLICT",
      "Requested time was taken or blocked.",
    );
  }
}

async function serializableMutation<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
    }
  }
  throw lastError;
}

function isRetryableTransactionError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(
      error.message,
    )
  );
}

function atLocalTime(
  date: NonNullable<ReturnType<typeof parseBookingDate>>,
  time: string,
  timezone: string,
) {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    new TZDate(date.year, date.month, date.day, hour, minute, timezone),
  );
}

function localDateForInstant(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

async function assertActiveCustomer(customerId: string) {
  const customer = await prisma.person.findFirst({
    where: {
      id: customerId,
      deletedAt: null,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!customer) {
    bookingDomainError(
      "CUSTOMER_UNAVAILABLE",
      "An active, onboarded customer profile is required.",
    );
  }
}

export function isCustomerCancellationStatus(status: BookingStatus) {
  return ACTIVE_BOOKING_STATUSES.includes(status as "PENDING" | "CONFIRMED");
}
