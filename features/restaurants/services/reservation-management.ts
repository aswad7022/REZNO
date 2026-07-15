import "server-only";

import {
  Prisma,
  type BookingStatus,
  type BusinessVertical,
  type RestaurantReservationMutationType,
} from "@prisma/client";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { RestaurantReservationError, restaurantReservationError } from "@/features/restaurants/domain/reservation-errors";
import {
  ACTIVE_RESTAURANT_RESERVATION_STATUSES,
  canCustomerManageRestaurantReservation,
  customerRestaurantReservationCursorWhere,
  customerRestaurantReservationOrder,
  customerRestaurantReservationTabWhere,
  decodeCustomerRestaurantReservationCursor,
  DEFAULT_RESTAURANT_RESERVATION_PAGE_SIZE,
  encodeCustomerRestaurantReservationCursor,
  MAX_RESTAURANT_RESERVATION_PAGE_SIZE,
  restaurantCancellationRequestHash,
  restaurantReservationRelationshipsAreValid,
  restaurantRescheduleRequestHash,
  restaurantReservationCancellationDeadline,
  type CustomerRestaurantReservationTab,
} from "@/features/restaurants/domain/reservation-management";
import {
  localDateForInstant,
  normalizeRestaurantNote,
  parseRestaurantDate,
  restaurantLocalTime,
  RESTAURANT_RESERVATION_DURATION_MINUTES,
  RESTAURANT_RESERVATION_INTERVAL_MINUTES,
  selectRestaurantTable,
  validateRestaurantDateRange,
  validateRestaurantGuestCount,
} from "@/features/restaurants/domain/reservation-policy";
import {
  restaurantReservationListInclude,
  serializeRestaurantReservationListItem,
} from "@/features/restaurants/services/reservation-detail";
import { getPublicRestaurantReservationAvailability } from "@/features/restaurants/services/reservation-public";
import type { CustomerRestaurantReservationPage } from "@/features/restaurants/types";
import { prisma } from "@/lib/db/prisma";

const MAX_SERIALIZABLE_ATTEMPTS = 4;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MutationInput = {
  bookingId: string;
  customerId: string;
  expectedBookingUpdatedAt?: string;
  idempotencyKey: string;
};

export async function listCustomerRestaurantReservations(input: {
  customerId: string;
  tab: CustomerRestaurantReservationTab;
  cursor?: string | null;
  limit?: number;
}): Promise<CustomerRestaurantReservationPage> {
  await assertActiveRestaurantCustomer(input.customerId);
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_RESTAURANT_RESERVATION_PAGE_SIZE, 1),
    MAX_RESTAURANT_RESERVATION_PAGE_SIZE,
  );
  const decoded = input.cursor
    ? decodeCustomerRestaurantReservationCursor(input.cursor, input.tab)
    : null;
  const snapshotAt = decoded ? new Date(decoded.snapshotAt) : new Date();
  const baseWhere: Prisma.BookingWhereInput = {
    customerId: input.customerId,
    branchServiceId: null,
    createdAt: { lte: snapshotAt },
    restaurantReservation: { isNot: null },
  };
  const tabWhere = customerRestaurantReservationTabWhere(input.tab, snapshotAt);
  const [rows, all, upcoming, completed, cancelled] = await Promise.all([
    prisma.booking.findMany({
      where: {
        AND: [
          baseWhere,
          tabWhere,
          ...(decoded
            ? [customerRestaurantReservationCursorWhere(decoded)]
            : []),
        ],
      },
      include: restaurantReservationListInclude,
      orderBy: [...customerRestaurantReservationOrder(input.tab)],
      take: limit + 1,
    }),
    prisma.booking.count({ where: baseWhere }),
    prisma.booking.count({
      where: {
        AND: [
          baseWhere,
          customerRestaurantReservationTabWhere("upcoming", snapshotAt),
        ],
      },
    }),
    prisma.booking.count({
      where: {
        AND: [
          baseWhere,
          customerRestaurantReservationTabWhere("completed", snapshotAt),
        ],
      },
    }),
    prisma.booking.count({
      where: {
        AND: [
          baseWhere,
          customerRestaurantReservationTabWhere("cancelled", snapshotAt),
        ],
      },
    }),
  ]);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    tab: input.tab,
    items: pageRows.map((booking) =>
      serializeRestaurantReservationListItem(booking, snapshotAt),
    ),
    nextCursor:
      hasMore && last
        ? encodeCustomerRestaurantReservationCursor({
            tab: input.tab,
            startsAt: last.startsAt.toISOString(),
            id: last.id,
            snapshotAt: snapshotAt.toISOString(),
          })
        : null,
    counts: { all, upcoming, completed, cancelled },
  };
}

export async function getCustomerRestaurantRescheduleOptions(input: {
  bookingId: string;
  customerId: string;
  date: string;
  guestCount: number;
  seatingArea: string | null;
}) {
  await assertActiveRestaurantCustomer(input.customerId);
  const booking = await prisma.booking.findFirst({
    where: {
      id: input.bookingId,
      customerId: input.customerId,
      branchServiceId: null,
      restaurantReservation: { isNot: null },
    },
    include: {
      organization: { include: { settings: true } },
      restaurantReservation: {
        include: {
          table: { select: { branchId: true, businessId: true } },
        },
      },
    },
  });
  if (!booking?.restaurantReservation) {
    restaurantReservationError("NOT_FOUND", "Restaurant reservation was not found.");
  }
  assertRestaurantReservationRelationships(booking);
  assertManagementEligibility(booking, "reschedule");
  const availability = await getPublicRestaurantReservationAvailability({
    branchId: booking.branchId,
    date: input.date,
    excludeBookingId: booking.id,
    guestCount: input.guestCount,
    seatingArea: input.seatingArea,
  });
  const sameCapacitySelection =
    input.guestCount === booking.restaurantReservation.guestCount &&
    (input.seatingArea === null ||
      input.seatingArea === booking.restaurantReservation.seatingArea);
  return {
    ...availability,
    slots: sameCapacitySelection
      ? availability.slots.filter(
          (slot) => slot.startsAt !== booking.startsAt.toISOString(),
        )
      : availability.slots,
  };
}

export async function cancelCustomerRestaurantReservation(input: {
  bookingId: string;
  customerId: string;
  expectedBookingUpdatedAt?: string;
  idempotencyKey: string;
  reason: string | null;
}) {
  const canonical = {
    ...canonicalMutationIdentity(input),
    reason: normalizeCancellationReason(input.reason),
  };
  await assertActiveRestaurantCustomer(canonical.customerId);
  const requestHash = restaurantCancellationRequestHash(canonical);
  const replay = await replayRestaurantMutation(
    canonical,
    "CANCELLATION",
    requestHash,
  );
  if (replay) return replay;
  const target = await prisma.booking.findFirst({
    where: restaurantBookingIdentityWhere(canonical),
    select: { branchId: true, updatedAt: true },
  });
  if (!target) {
    restaurantReservationError("NOT_FOUND", "Restaurant reservation was not found.");
  }
  const expectedBookingUpdatedAt = expectedRestaurantBookingVersion(
    canonical.expectedBookingUpdatedAt,
    target.updatedAt,
  );
  assertExpectedBookingVersion(target.updatedAt, expectedBookingUpdatedAt);

  try {
    return await serializableRestaurantMutation(async (transaction) => {
      await assertActiveRestaurantCustomer(canonical.customerId, transaction);
      await lockRestaurantBranch(transaction, target.branchId);
      const existingMutation = await transaction.restaurantReservationMutation.findUnique({
        where: {
          customerId_idempotencyKey: {
            customerId: canonical.customerId,
            idempotencyKey: canonical.idempotencyKey,
          },
        },
        include: { booking: { select: { id: true, customerId: true, updatedAt: true } } },
      });
      if (existingMutation) {
        return assertReplayIsCurrent(
          existingMutation,
          canonical,
          "CANCELLATION",
          requestHash,
        );
      }
      const booking = await transaction.booking.findFirst({
        where: restaurantBookingIdentityWhere(canonical),
        include: {
          organization: { include: { settings: true } },
          restaurantReservation: {
            include: {
              table: { select: { branchId: true, businessId: true } },
            },
          },
        },
      });
      if (!booking?.restaurantReservation) {
        restaurantReservationError("NOT_FOUND", "Restaurant reservation was not found.");
      }
      assertRestaurantReservationRelationships(booking);
      assertExpectedBookingVersion(booking.updatedAt, expectedBookingUpdatedAt);
      assertManagementEligibility(booking, "cancel");
      const mutationAt = new Date();
      const changed = await transaction.booking.updateMany({
        where: {
          id: booking.id,
          customerId: canonical.customerId,
          status: booking.status,
          updatedAt: booking.updatedAt,
        },
        data: {
          status: "CANCELLED",
          cancelledAt: mutationAt,
          cancellationReason: canonical.reason,
          updatedAt: mutationAt,
        },
      });
      if (changed.count !== 1) {
        restaurantReservationError(
          "BOOKING_STATE_CONFLICT",
          "Restaurant reservation changed while cancellation was processed.",
        );
      }
      const mutation = await transaction.restaurantReservationMutation.create({
        data: {
          bookingId: booking.id,
          customerId: canonical.customerId,
          type: "CANCELLATION",
          idempotencyKey: canonical.idempotencyKey,
          requestHash,
          bookingUpdatedAtSnapshot: booking.updatedAt,
          resultBookingUpdatedAt: mutationAt,
        },
      });
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: "CANCELLED",
          changedByPersonId: canonical.customerId,
          note: canonical.reason ?? "Restaurant reservation cancelled by customer.",
        },
      });
      await transaction.notification.create({
        data: {
          audience: "BUSINESS",
          businessId: booking.organizationId,
          priority: "IMPORTANT",
          eventKey: `restaurant-reservation:${booking.id}:cancelled:${mutation.id}`,
          title: "Restaurant reservation cancelled",
          body: `Reservation for ${booking.restaurantReservation.guestCount} guests was cancelled.`,
          metadata: {
            bookingId: booking.id,
            event: "restaurant.reservation.cancelled",
          },
        },
      });
      return { bookingId: booking.id, mutationId: mutation.id, replayed: false };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const replayAfterRace = await replayRestaurantMutation(
        canonical,
        "CANCELLATION",
        requestHash,
      );
      if (replayAfterRace) return replayAfterRace;
    }
    throw error;
  }
}

export async function rescheduleCustomerRestaurantReservation(input: {
  bookingId: string;
  customerId: string;
  customerNote: string | null;
  date: string;
  expectedBookingUpdatedAt?: string;
  guestCount: number;
  idempotencyKey: string;
  seatingArea: string | null;
  startsAt: string;
}) {
  const canonical = canonicalRescheduleInput(input);
  await assertActiveRestaurantCustomer(canonical.customerId);
  const requestHash = restaurantRescheduleRequestHash(canonical);
  const replay = await replayRestaurantMutation(
    canonical,
    "RESCHEDULE",
    requestHash,
  );
  if (replay) return replay;
  const target = await prisma.booking.findFirst({
    where: restaurantBookingIdentityWhere(canonical),
    select: { branchId: true, updatedAt: true },
  });
  if (!target) {
    restaurantReservationError("NOT_FOUND", "Restaurant reservation was not found.");
  }
  const expectedBookingUpdatedAt = expectedRestaurantBookingVersion(
    canonical.expectedBookingUpdatedAt,
    target.updatedAt,
  );
  assertExpectedBookingVersion(target.updatedAt, expectedBookingUpdatedAt);

  try {
    return await serializableRestaurantMutation(async (transaction) => {
      await assertActiveRestaurantCustomer(canonical.customerId, transaction);
      await lockRestaurantBranch(transaction, target.branchId);
      const existingMutation = await transaction.restaurantReservationMutation.findUnique({
        where: {
          customerId_idempotencyKey: {
            customerId: canonical.customerId,
            idempotencyKey: canonical.idempotencyKey,
          },
        },
        include: { booking: { select: { id: true, customerId: true, updatedAt: true } } },
      });
      if (existingMutation) {
        return assertReplayIsCurrent(
          existingMutation,
          canonical,
          "RESCHEDULE",
          requestHash,
        );
      }
      const booking = await transaction.booking.findFirst({
        where: restaurantBookingIdentityWhere(canonical),
        include: {
          branch: { include: { businessHours: true, blockedTimes: { where: { memberId: null } } } },
          organization: {
            include: {
              settings: true,
              restaurantTables: {
                where: { branchId: target.branchId, isActive: true },
                select: { id: true, name: true, capacity: true, area: true },
              },
            },
          },
          restaurantReservation: {
            include: {
              table: { select: { branchId: true, businessId: true } },
            },
          },
        },
      });
      if (!booking?.restaurantReservation) {
        restaurantReservationError("NOT_FOUND", "Restaurant reservation was not found.");
      }
      assertRestaurantReservationRelationships(booking);
      assertExpectedBookingVersion(booking.updatedAt, expectedBookingUpdatedAt);
      assertManagementEligibility(booking, "reschedule");
      assertReservableRestaurant(booking);

      const now = new Date();
      const parsedDate = validateRestaurantDateRange(
        canonical.date,
        booking.branch.timezone,
        now,
      );
      const startsAt = new Date(canonical.startsAt);
      const endsAt = new Date(
        startsAt.getTime() + RESTAURANT_RESERVATION_DURATION_MINUTES * 60_000,
      );
      if (
        startsAt <= now ||
        localDateForInstant(startsAt, booking.branch.timezone) !== canonical.date
      ) {
        restaurantReservationError("SLOT_UNAVAILABLE", "Requested reservation time is invalid.");
      }
      const dayOfWeek = new Date(
        Date.UTC(parsedDate.year, parsedDate.month, parsedDate.day),
      ).getUTCDay();
      const hours = booking.branch.businessHours.find(
        (value) => value.dayOfWeek === dayOfWeek && value.isOpen,
      );
      const opensAt = hours
        ? restaurantLocalTime(parsedDate, hours.openTime, booking.branch.timezone)
        : null;
      const closesAt = hours
        ? restaurantLocalTime(parsedDate, hours.closeTime, booking.branch.timezone)
        : null;
      if (
        !opensAt ||
        !closesAt ||
        opensAt >= closesAt ||
        startsAt < opensAt ||
        endsAt > closesAt ||
        (startsAt.getTime() - opensAt.getTime()) %
          (RESTAURANT_RESERVATION_INTERVAL_MINUTES * 60_000) !==
          0
      ) {
        restaurantReservationError(
          "RESTAURANT_CLOSED",
          "Requested time is outside restaurant reservation hours.",
        );
      }
      if (
        booking.branch.blockedTimes.some(
          (block) => startsAt < block.endsAt && endsAt > block.startsAt,
        )
      ) {
        restaurantReservationError("TABLE_CONFLICT", "Requested time is blocked.");
      }
      const seatingAreas = new Set(
        booking.organization.restaurantTables.flatMap((table) =>
          table.area ? [table.area] : [],
        ),
      );
      if (canonical.seatingArea && !seatingAreas.has(canonical.seatingArea)) {
        restaurantReservationError(
          "CAPACITY_UNAVAILABLE",
          "Requested seating area is unavailable.",
        );
      }
      const capacityTables = booking.organization.restaurantTables.filter(
        (table) =>
          table.capacity >= canonical.guestCount &&
          (!canonical.seatingArea || table.area === canonical.seatingArea),
      );
      if (capacityTables.length === 0) {
        restaurantReservationError(
          "CAPACITY_UNAVAILABLE",
          "No active table can accommodate the requested party.",
        );
      }
      const occupied = await transaction.booking.findMany({
        where: {
          id: { not: booking.id },
          branchId: booking.branchId,
          status: { in: [...ACTIVE_RESTAURANT_RESERVATION_STATUSES] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          restaurantReservation: {
            tableId: { in: capacityTables.map((table) => table.id) },
          },
        },
        select: { restaurantReservation: { select: { tableId: true } } },
      });
      const occupiedTableIds = new Set(
        occupied.flatMap((candidate) =>
          candidate.restaurantReservation
            ? [candidate.restaurantReservation.tableId]
            : [],
        ),
      );
      const table = selectRestaurantTable(
        capacityTables.filter((candidate) => !occupiedTableIds.has(candidate.id)),
        canonical.guestCount,
        canonical.seatingArea,
      );
      if (!table) {
        restaurantReservationError(
          "TABLE_CONFLICT",
          "No suitable table remains available for this time.",
        );
      }
      const unchanged =
        startsAt.getTime() === booking.startsAt.getTime() &&
        canonical.guestCount === booking.restaurantReservation.guestCount &&
        (canonical.seatingArea === null ||
          canonical.seatingArea === booking.restaurantReservation.seatingArea) &&
        canonical.customerNote === booking.restaurantReservation.customerNote;
      if (unchanged) {
        restaurantReservationError(
          "INVALID_REQUEST",
          "Restaurant reservation changes are unchanged.",
        );
      }

      const mutationAt = new Date();
      const changed = await transaction.booking.updateMany({
        where: {
          id: booking.id,
          customerId: canonical.customerId,
          status: booking.status,
          updatedAt: booking.updatedAt,
        },
        data: {
          startsAt,
          endsAt,
          notes: canonical.customerNote,
          updatedAt: mutationAt,
        },
      });
      if (changed.count !== 1) {
        restaurantReservationError(
          "BOOKING_STATE_CONFLICT",
          "Restaurant reservation changed while rescheduling was processed.",
        );
      }
      const detailsChanged = await transaction.restaurantReservationDetails.updateMany({
        where: {
          bookingId: booking.id,
          id: booking.restaurantReservation.id,
          updatedAt: booking.restaurantReservation.updatedAt,
        },
        data: {
          tableId: table.id,
          guestCount: canonical.guestCount,
          reservationDateTime: startsAt,
          seatingArea: table.area,
          customerNote: canonical.customerNote,
          updatedAt: mutationAt,
        },
      });
      if (detailsChanged.count !== 1) {
        restaurantReservationError(
          "BOOKING_STATE_CONFLICT",
          "Restaurant reservation details changed while rescheduling was processed.",
        );
      }
      const mutation = await transaction.restaurantReservationMutation.create({
        data: {
          bookingId: booking.id,
          customerId: canonical.customerId,
          type: "RESCHEDULE",
          idempotencyKey: canonical.idempotencyKey,
          requestHash,
          bookingUpdatedAtSnapshot: booking.updatedAt,
          resultBookingUpdatedAt: mutationAt,
        },
      });
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: booking.status,
          changedByPersonId: canonical.customerId,
          note: `Restaurant reservation rescheduled by customer from ${booking.startsAt.toISOString()} to ${startsAt.toISOString()}; guests ${booking.restaurantReservation.guestCount} to ${canonical.guestCount}.`,
        },
      });
      await transaction.notification.create({
        data: {
          audience: "BUSINESS",
          businessId: booking.organizationId,
          priority: "IMPORTANT",
          eventKey: `restaurant-reservation:${booking.id}:rescheduled:${mutation.id}`,
          title: "Restaurant reservation rescheduled",
          body: `Reservation moved to ${startsAt.toISOString()} for ${canonical.guestCount} guests.`,
          metadata: {
            bookingId: booking.id,
            event: "restaurant.reservation.rescheduled",
          },
        },
      });
      return { bookingId: booking.id, mutationId: mutation.id, replayed: false };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const replayAfterRace = await replayRestaurantMutation(
        canonical,
        "RESCHEDULE",
        requestHash,
      );
      if (replayAfterRace) return replayAfterRace;
    }
    throw error;
  }
}

function restaurantBookingIdentityWhere(input: MutationInput): Prisma.BookingWhereInput {
  return {
    id: input.bookingId,
    customerId: input.customerId,
    branchServiceId: null,
    restaurantReservation: { isNot: null },
  };
}

function canonicalMutationIdentity<T extends MutationInput>(input: T): T {
  if (
    !UUID_PATTERN.test(input.bookingId) ||
    !UUID_PATTERN.test(input.customerId) ||
    !UUID_PATTERN.test(input.idempotencyKey)
  ) {
    restaurantReservationError(
      "INVALID_REQUEST",
      "Booking, customer, and idempotency identifiers must be UUIDs.",
    );
  }
  return {
    ...input,
    bookingId: input.bookingId.toLowerCase(),
    customerId: input.customerId.toLowerCase(),
    idempotencyKey: input.idempotencyKey.toLowerCase(),
  };
}

function canonicalRescheduleInput(input: Parameters<typeof rescheduleCustomerRestaurantReservation>[0]) {
  const identity = canonicalMutationIdentity(input);
  const date = input.date.trim();
  const startsAt = input.startsAt.trim();
  const parsedStartsAt = new Date(startsAt);
  if (
    !parseRestaurantDate(date) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startsAt) ||
    !Number.isFinite(parsedStartsAt.getTime()) ||
    parsedStartsAt.toISOString() !== startsAt
  ) {
    restaurantReservationError(
      "INVALID_REQUEST",
      "A valid date and canonical UTC startsAt are required.",
    );
  }
  if (input.seatingArea !== null && typeof input.seatingArea !== "string") {
    restaurantReservationError("INVALID_REQUEST", "seatingArea must be a string or null.");
  }
  const seatingArea = input.seatingArea?.trim() || null;
  if ((seatingArea?.length ?? 0) > 120) {
    restaurantReservationError("INVALID_REQUEST", "seatingArea is too long.");
  }
  return {
    ...identity,
    customerNote: normalizeRestaurantNote(input.customerNote),
    date,
    guestCount: validateRestaurantGuestCount(input.guestCount),
    seatingArea,
    startsAt,
  };
}

function normalizeCancellationReason(value: string | null | undefined) {
  if (value !== null && value !== undefined && typeof value !== "string") {
    restaurantReservationError("INVALID_REQUEST", "reason must be a string or null.");
  }
  const reason = value?.trim() ?? "";
  if (reason.length > 500) {
    restaurantReservationError("INVALID_REQUEST", "reason must not exceed 500 characters.");
  }
  return reason || null;
}

function assertExpectedBookingVersion(current: Date, expected: Date) {
  if (current.getTime() !== expected.getTime()) {
    restaurantReservationError(
      "BOOKING_STATE_CONFLICT",
      "Restaurant reservation changed after this mutation began.",
    );
  }
}

function expectedRestaurantBookingVersion(value: string | undefined, fallback: Date) {
  if (value === undefined) return fallback;
  const parsed = new Date(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    restaurantReservationError(
      "INVALID_REQUEST",
      "Expected Restaurant reservation version must be a canonical UTC timestamp.",
    );
  }
  return parsed;
}

function assertManagementEligibility(
  booking: {
    startsAt: Date;
    status: BookingStatus;
    organization: { settings: { cancellationWindowHours: number } | null };
  },
  operation: "cancel" | "reschedule",
) {
  if (
    !ACTIVE_RESTAURANT_RESERVATION_STATUSES.includes(
      booking.status as (typeof ACTIVE_RESTAURANT_RESERVATION_STATUSES)[number],
    )
  ) {
    restaurantReservationError(
      operation === "cancel"
        ? "BOOKING_NOT_CANCELLABLE"
        : "BOOKING_NOT_RESCHEDULABLE",
      `Restaurant reservation status does not allow ${operation}.`,
    );
  }
  const deadline = restaurantReservationCancellationDeadline(
    booking.startsAt,
    booking.organization.settings?.cancellationWindowHours,
  );
  if (new Date() >= deadline) {
    restaurantReservationError(
      "CANCELLATION_DEADLINE_PASSED",
      `Restaurant reservation ${operation} deadline has passed.`,
      { deadline: deadline.toISOString() },
    );
  }
  if (!canCustomerManageRestaurantReservation({
    status: booking.status,
    startsAt: booking.startsAt,
    cancellationWindowHours:
      booking.organization.settings?.cancellationWindowHours,
  })) {
    restaurantReservationError(
      "BOOKING_STATE_CONFLICT",
      "Restaurant reservation is no longer manageable.",
    );
  }
}

function assertReservableRestaurant(booking: {
  branchId: string;
  organizationId: string;
  branch: { organizationId: string; deletedAt: Date | null; status: string };
  organization: {
    deletedAt: Date | null;
    isActive: boolean;
    status: string;
    vertical: BusinessVertical;
    settings: { bookingEnabled: boolean; marketplaceVisible: boolean } | null;
    restaurantTables: unknown[];
  };
  restaurantReservation: {
    businessId: string;
    branchId: string | null;
    table: { branchId: string | null; businessId: string };
  } | null;
}) {
  if (
    !booking.restaurantReservation ||
    booking.branch.organizationId !== booking.organizationId ||
    booking.restaurantReservation.businessId !== booking.organizationId ||
    booking.restaurantReservation.branchId !== booking.branchId ||
    booking.branch.deletedAt ||
    booking.branch.status !== "ACTIVE" ||
    booking.organization.deletedAt ||
    !booking.organization.isActive ||
    booking.organization.status !== "ACTIVE" ||
    !isRestaurantVertical(booking.organization.vertical) ||
    !booking.organization.settings?.bookingEnabled ||
    !booking.organization.settings.marketplaceVisible ||
    booking.organization.restaurantTables.length === 0
  ) {
    restaurantReservationError(
      "BUSINESS_UNAVAILABLE",
      "Restaurant, branch, settings, or active tables are unavailable for rescheduling.",
    );
  }
}

function assertRestaurantReservationRelationships(booking: {
  branchId: string;
  organizationId: string;
  restaurantReservation: {
    branchId: string | null;
    businessId: string;
    table: { branchId: string | null; businessId: string };
  } | null;
}) {
  if (!restaurantReservationRelationshipsAreValid(booking)) {
    restaurantReservationError(
      "NOT_FOUND",
      "Restaurant reservation was not found.",
    );
  }
}

async function replayRestaurantMutation(
  input: MutationInput,
  type: RestaurantReservationMutationType,
  requestHash: string,
) {
  const existing = await prisma.restaurantReservationMutation.findUnique({
    where: {
      customerId_idempotencyKey: {
        customerId: input.customerId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { booking: { select: { id: true, customerId: true, updatedAt: true } } },
  });
  return existing
    ? assertReplayIsCurrent(existing, input, type, requestHash)
    : null;
}

function assertReplayIsCurrent(
  mutation: {
    id: string;
    bookingId: string;
    customerId: string;
    type: RestaurantReservationMutationType;
    requestHash: string;
    resultBookingUpdatedAt: Date;
    booking: { id: string; customerId: string; updatedAt: Date };
  },
  input: MutationInput,
  type: RestaurantReservationMutationType,
  requestHash: string,
) {
  if (
    mutation.bookingId !== input.bookingId ||
    mutation.customerId !== input.customerId ||
    mutation.type !== type ||
    mutation.requestHash !== requestHash ||
    mutation.booking.id !== input.bookingId ||
    mutation.booking.customerId !== input.customerId
  ) {
    restaurantReservationError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used for another restaurant mutation.",
    );
  }
  if (
    mutation.booking.updatedAt.getTime() !==
    mutation.resultBookingUpdatedAt.getTime()
  ) {
    restaurantReservationError(
      "BOOKING_STATE_CONFLICT",
      "This restaurant mutation replay is stale because the reservation changed later.",
    );
  }
  return { bookingId: mutation.bookingId, mutationId: mutation.id, replayed: true };
}

async function lockRestaurantBranch(
  transaction: Prisma.TransactionClient,
  branchId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`
      SELECT 1::int AS "locked"
      FROM (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`restaurant-reservation:${branchId}`}, 0)
        )
      ) AS "reservationLock"
    `,
  );
}

async function serializableRestaurantMutation<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
    }
  }
  throw lastError;
}

function isRetryableTransactionError(error: unknown) {
  if (error instanceof RestaurantReservationError) return false;
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

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function assertActiveRestaurantCustomer(
  customerId: string,
  database: Pick<Prisma.TransactionClient, "person"> = prisma,
) {
  const customer = await database.person.findFirst({
    where: {
      id: customerId,
      deletedAt: null,
      isOnboarded: true,
      phone: { not: null },
      status: "ACTIVE",
    },
    select: { id: true, phone: true },
  });
  if (!customer?.phone?.trim()) {
    restaurantReservationError(
      "CUSTOMER_UNAVAILABLE",
      "An active, onboarded customer with a completed phone number is required.",
    );
  }
}
