import "server-only";

import { TZDate } from "@date-fns/tz";
import { Prisma } from "@prisma/client";

import {
  bookingCreationRequestHash,
  selectionMatchesSlot,
  type BookingCreationSelection,
} from "@/features/bookings/domain/creation";
import { parseBookingDate } from "@/features/bookings/domain/date";
import {
  BookingDomainError,
  bookingDomainError,
} from "@/features/bookings/domain/errors";
import {
  activeServiceStaffAssignmentMemberIds,
  activeServiceStaffAssignmentWhere,
  serviceStaffAssignmentPolicySelect,
  serviceStaffPolicyAllowsMember,
} from "@/features/bookings/domain/staff-assignment-policy";
import { getPublicBookingAvailability } from "@/features/bookings/services/booking-availability";
import {
  serializePersistedBookingDetail,
} from "@/features/bookings/services/booking-detail";
import { prisma } from "@/lib/db/prisma";
import { createBusinessBookingNotifications } from "@/features/notifications/services/booking-events";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;
const MAX_SERIALIZABLE_ATTEMPTS = 4;

export interface CreateCustomerBookingInput extends BookingCreationSelection {
  customerId: string;
  idempotencyKey: string;
}

export interface CreatedCustomerBooking {
  booking: ReturnType<typeof serializePersistedBookingDetail>;
  replayed: boolean;
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

function isRetryableTransactionError(error: unknown) {
  if (error instanceof BookingDomainError) return false;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }
  if (error instanceof Error) {
    return /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(
      error.message,
    );
  }
  if (typeof error === "object" && error !== null && "cause" in error) {
    const cause = error.cause;
    if (typeof cause === "object" && cause !== null) {
      const originalCode =
        "originalCode" in cause ? String(cause.originalCode) : "";
      const kind = "kind" in cause ? String(cause.kind) : "";
      return (
        originalCode === "40001" ||
        originalCode === "40P01" ||
        kind === "TransactionWriteConflict"
      );
    }
  }
  return false;
}

async function replayExistingBooking(
  customerId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<CreatedCustomerBooking | null> {
  const existing = await prisma.booking.findFirst({
    where: { customerId, creationIdempotencyKey: idempotencyKey },
    include: {
      branch: true,
      member: { include: { person: true } },
      organization: true,
    },
  });
  if (!existing) return null;
  if (existing.creationRequestHash !== requestHash) {
    bookingDomainError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used for a different booking request.",
    );
  }
  return { booking: serializePersistedBookingDetail(existing), replayed: true };
}

export async function createCustomerBooking(
  input: CreateCustomerBookingInput,
): Promise<CreatedCustomerBooking> {
  const selection: BookingCreationSelection = {
    branchServiceId: input.branchServiceId,
    date: input.date,
    memberId: input.memberId,
    startsAt: input.startsAt,
  };
  const requestHash = bookingCreationRequestHash(selection);
  const replay = await replayExistingBooking(
    input.customerId,
    input.idempotencyKey,
    requestHash,
  );
  if (replay) return replay;

  const availability = await getPublicBookingAvailability({
    branchServiceId: input.branchServiceId,
    date: input.date,
    memberId: input.memberId,
  });
  if (!availability.slots.some((slot) => selectionMatchesSlot(selection, slot))) {
    bookingDomainError(
      "SLOT_UNAVAILABLE",
      "Selected booking slot is no longer available.",
      { reason: availability.reason },
    );
  }

  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.booking.findFirst({
            where: {
              customerId: input.customerId,
              creationIdempotencyKey: input.idempotencyKey,
            },
            include: {
              branch: true,
              member: { include: { person: true } },
              organization: true,
            },
          });
          if (existing) {
            if (existing.creationRequestHash !== requestHash) {
              bookingDomainError(
                "IDEMPOTENCY_CONFLICT",
                "Idempotency key was already used for a different booking request.",
              );
            }
            return {
              booking: serializePersistedBookingDetail(existing),
              replayed: true,
            };
          }

          const customer = await transaction.person.findFirst({
            where: {
              id: input.customerId,
              deletedAt: null,
              isOnboarded: true,
              status: "ACTIVE",
            },
          });
          if (!customer) {
            bookingDomainError(
              "CUSTOMER_UNAVAILABLE",
              "An active, onboarded customer profile is required.",
            );
          }

          const offering = await transaction.branchService.findFirst({
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
                  settings: {
                    bookingEnabled: true,
                    marketplaceVisible: true,
                  },
                },
              },
            },
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
                  businessHours: true,
                  organization: true,
                },
              },
            },
          });
          if (!offering) {
            bookingDomainError(
              "SERVICE_UNAVAILABLE",
              "Service offering is no longer available.",
            );
          }
          if (offering.service.organizationId !== offering.branch.organizationId) {
            bookingDomainError(
              "SERVICE_UNAVAILABLE",
              "Service and branch do not belong to the same business.",
            );
          }
          if (
            offering.branch.organization.vertical === "RESTAURANT" ||
            offering.branch.organization.vertical === "CAFE"
          ) {
            bookingDomainError(
              "RESTAURANT_FLOW_REQUIRED",
              "Restaurant reservations use a separate booking flow.",
            );
          }

          const mode = offering.service.staffSelectionMode;
          if (mode === "REQUIRED" && !input.memberId) {
            bookingDomainError("STAFF_REQUIRED", "A staff member must be selected.");
          }
          if (mode === "NONE" && input.memberId) {
            bookingDomainError(
              "STAFF_UNAVAILABLE",
              "This service does not accept staff selection.",
            );
          }

          const parsedDate = parseBookingDate(input.date);
          const startsAt = new Date(input.startsAt);
          const endsAt = new Date(
            startsAt.getTime() + offering.durationMinutes * 60_000,
          );
          if (
            !parsedDate ||
            !Number.isFinite(startsAt.getTime()) ||
            startsAt <= new Date() ||
            localDateForInstant(startsAt, offering.branch.timezone) !== input.date
          ) {
            bookingDomainError("SLOT_UNAVAILABLE", "Selected time is invalid.");
          }

          const dayOfWeek = new Date(
            Date.UTC(parsedDate.year, parsedDate.month, parsedDate.day),
          ).getUTCDay();
          const businessHours = offering.branch.businessHours.find(
            (hours) => hours.dayOfWeek === dayOfWeek && hours.isOpen,
          );
          if (!businessHours) {
            bookingDomainError("SLOT_UNAVAILABLE", "Branch is closed on this date.");
          }
          const businessStart = atLocalTime(
            parsedDate,
            businessHours.openTime,
            offering.branch.timezone,
          );
          const businessEnd = atLocalTime(
            parsedDate,
            businessHours.closeTime,
            offering.branch.timezone,
          );
          if (startsAt < businessStart || endsAt > businessEnd) {
            bookingDomainError(
              "SLOT_UNAVAILABLE",
              "Selected time is outside branch hours.",
            );
          }

          let selectedMemberId = input.memberId;
          if (mode === "OPTIONAL" && !selectedMemberId) {
            const assignedMemberIds = activeServiceStaffAssignmentMemberIds({
              assignments: offering.service.staffAssignments,
              organizationId: offering.service.organizationId,
              serviceId: offering.service.id,
            });
            if (assignedMemberIds.size > 0) {
              const candidates = await transaction.organizationMember.findMany({
                where: {
                  id: { in: [...assignedMemberIds] },
                  organizationId: offering.branch.organizationId,
                  deletedAt: null,
                  status: "ACTIVE",
                  person: { deletedAt: null, status: "ACTIVE" },
                  assignments: { some: { branchId: offering.branchId } },
                },
                include: {
                  availabilities: {
                    where: {
                      branchId: offering.branchId,
                      dayOfWeek,
                      isActive: true,
                    },
                  },
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              });
              for (const candidate of candidates) {
                const insideAvailability = candidate.availabilities.some(
                  (window) =>
                    startsAt >= atLocalTime(parsedDate, window.startTime, offering.branch.timezone) &&
                    endsAt <= atLocalTime(parsedDate, window.endTime, offering.branch.timezone),
                );
                if (!insideAvailability) continue;
                const candidateConflict = await transaction.booking.findFirst({
                    where: {
                      branchId: offering.branchId,
                      memberId: candidate.id,
                      status: { in: [...ACTIVE_BOOKING_STATUSES] },
                      startsAt: { lt: endsAt },
                      endsAt: { gt: startsAt },
                    },
                    select: { id: true },
                  });
                const candidateBlock = await transaction.blockedTime.findFirst({
                    where: {
                      branchId: offering.branchId,
                      memberId: candidate.id,
                      startsAt: { lt: endsAt },
                      endsAt: { gt: startsAt },
                    },
                    select: { id: true },
                  });
                if (!candidateConflict && !candidateBlock) {
                  selectedMemberId = candidate.id;
                  break;
                }
              }
              if (!selectedMemberId) {
                bookingDomainError("STAFF_UNAVAILABLE", "No assigned staff member is available for this time.");
              }
            }
          }

          if (selectedMemberId) {
            const member = await transaction.organizationMember.findFirst({
              where: {
                id: selectedMemberId,
                organizationId: offering.branch.organizationId,
                deletedAt: null,
                status: "ACTIVE",
                person: { deletedAt: null, status: "ACTIVE" },
                assignments: { some: { branchId: offering.branchId } },
              },
              include: {
                availabilities: {
                  where: {
                    branchId: offering.branchId,
                    dayOfWeek,
                    isActive: true,
                  },
                },
              },
            });
            const activeAssignmentMemberIds =
              activeServiceStaffAssignmentMemberIds({
                assignments: offering.service.staffAssignments,
                organizationId: offering.service.organizationId,
                serviceId: offering.service.id,
              });
            const assignedToService = serviceStaffPolicyAllowsMember(
              activeAssignmentMemberIds,
              selectedMemberId,
            );
            const insideAvailability = member?.availabilities.some(
              (window) =>
                startsAt >=
                  atLocalTime(
                    parsedDate,
                    window.startTime,
                    offering.branch.timezone,
                  ) &&
                endsAt <=
                  atLocalTime(
                    parsedDate,
                    window.endTime,
                    offering.branch.timezone,
                  ),
            );
            if (
              !member ||
              !assignedToService ||
              !insideAvailability
            ) {
              bookingDomainError(
                "STAFF_UNAVAILABLE",
                "Staff member is unavailable for this service and time.",
              );
            }
          }

          const conflict = await transaction.booking.findFirst({
            where: {
              branchId: offering.branchId,
              memberId: selectedMemberId,
              status: { in: [...ACTIVE_BOOKING_STATUSES] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          });
          const blocked = await transaction.blockedTime.findFirst({
            where: {
              branchId: offering.branchId,
              OR: [
                { memberId: null },
                ...(selectedMemberId ? [{ memberId: selectedMemberId }] : []),
              ],
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          });
          if (conflict || blocked) {
            bookingDomainError(
              "SLOT_CONFLICT",
              "Selected booking slot was taken or blocked.",
            );
          }

          const booking = await transaction.booking.create({
            data: {
              organizationId: offering.branch.organizationId,
              branchId: offering.branchId,
              branchServiceId: offering.id,
              customerId: customer.id,
              memberId: selectedMemberId,
              startsAt,
              endsAt,
              serviceNameSnapshot: offering.service.name,
              customerNameSnapshot:
                customer.displayName ?? customer.firstName,
              priceSnapshot: offering.price,
              creationIdempotencyKey: input.idempotencyKey,
              creationRequestHash: requestHash,
              statusHistory: {
                create: {
                  toStatus: "CONFIRMED",
                  changedByPersonId: customer.id,
                },
              },
            },
            include: {
              branch: true,
              member: { include: { person: true } },
              organization: true,
            },
          });
          await Promise.all([
            createBusinessBookingNotifications(transaction, {
              bookingId: booking.id,
              event: "booking.created",
              eventKey: `booking:${booking.id}:created`,
            }),
            createCanonicalNotifications(transaction, [{
              audience: "USER",
              body: "Your service booking was created. Open the booking to review its details.",
              bodyKey: "notifications.booking.created.customer.body",
              businessId: booking.organizationId,
              category: "BOOKINGS",
              destinationKind: "CUSTOMER_BOOKING",
              destinationTargetId: booking.id,
              eventKey: `booking:${booking.id}:created:customer:${booking.customerId}`,
              eventType: "booking.created",
              mandatory: true,
              priority: "IMPORTANT",
              recipientPersonId: booking.customerId,
              sourceId: booking.id,
              sourceType: "BOOKING",
              title: "Booking created",
              titleKey: "notifications.booking.created.customer.title",
            }]),
          ]);
          return {
            booking: serializePersistedBookingDetail(booking),
            replayed: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replayAfterRace = await replayExistingBooking(
          input.customerId,
          input.idempotencyKey,
          requestHash,
        );
        if (replayAfterRace) return replayAfterRace;
      }
      if (!isRetryableTransactionError(error)) throw error;
    }
  }

  bookingDomainError(
    "SLOT_CONFLICT",
    "Booking could not be completed safely after bounded retries.",
    { attempts: MAX_SERIALIZABLE_ATTEMPTS },
  );
}
