import "server-only";

import { Prisma } from "@prisma/client";

import {
  availableOperationalBookingTransitions,
  operationalRestaurantRescheduleSchema,
  safeOperationalActivity,
} from "@/features/business-operations/domain/daily-operations";
import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { hashBusinessOperation } from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import { createCustomerOperationalNotification } from "@/features/business-operations/services/operational-notifications";
import {
  assertExpectedVersion,
  lockBooking,
  lockRestaurantBranchAllocation,
  lockRestaurantReservationDetails,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { bookingReference } from "@/features/bookings/domain/creation";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import {
  localDateForInstant,
  restaurantLocalTime,
  RESTAURANT_RESERVATION_INTERVAL_MINUTES,
  selectRestaurantTable,
  validateRestaurantDateRange,
} from "@/features/restaurants/domain/reservation-policy";
import { prisma } from "@/lib/db/prisma";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"] as const;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    businessOperationsError("INVALID_REQUEST", `${label} must be a UUID.`);
  }
}

function assertReceptionistBranch(
  actor: BusinessOperationActor,
  branch: { deletedAt: Date | null; status: string },
) {
  if (actor.role === "RECEPTIONIST" && (branch.deletedAt || branch.status !== "ACTIVE")) {
    businessOperationsError("RESTAURANT_NOT_FOUND", "Restaurant reservation was not found.");
  }
}

const detailInclude = Prisma.validator<Prisma.BookingInclude>()({
  branch: { include: { blockedTimes: { where: { memberId: null } }, businessHours: true } },
  customer: { select: { authUserId: true, phone: true } },
  organization: true,
  restaurantReservation: {
    include: {
      items: { include: { menuItem: { select: { name: true } } } },
      table: true,
    },
  },
  statusHistory: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
});

type RestaurantOperationalBooking = Prisma.BookingGetPayload<{
  include: typeof detailInclude;
}>;

function assertRestaurantRelationships(booking: RestaurantOperationalBooking) {
  const details = booking.restaurantReservation;
  if (
    !details ||
    booking.branch.organizationId !== booking.organizationId ||
    details.businessId !== booking.organizationId ||
    details.branchId !== booking.branchId ||
    details.table.businessId !== booking.organizationId ||
    details.table.branchId !== booking.branchId
  ) {
    businessOperationsError("RESTAURANT_NOT_FOUND", "Restaurant reservation was not found.");
  }
  return details;
}

export interface OperationalRestaurantReservationDetail {
  activity: Array<{
    createdAt: string;
    event: NonNullable<ReturnType<typeof safeOperationalActivity>>;
    id: string;
  }>;
  bookingVersion: string;
  branch: { id: string; name: string; timezone: string };
  cancellation: { cancelledAt: string | null; reason: string | null };
  customer: { email: string | null; name: string; phone: string | null };
  customerNote: string | null;
  endsAt: string;
  guestCount: number;
  id: string;
  organizationName: string;
  permittedTransitions: ReturnType<typeof availableOperationalBookingTransitions>;
  preorder: Array<{
    currency: string;
    id: string;
    name: string;
    note: string | null;
    quantity: number;
    unitPrice: string;
  }>;
  reference: string;
  reservationVersion: string;
  scope: "MANAGEMENT" | "RECEPTIONIST";
  seatingArea: string | null;
  startsAt: string;
  status: RestaurantOperationalBooking["status"];
  table: { capacity: number; id: string; name: string };
  tableOptions: Array<{
    area: string | null;
    capacity: number;
    id: string;
    name: string;
  }>;
}

export async function getOperationalRestaurantReservationDetail(
  reference: BusinessOperationActorReference,
  bookingId: string,
): Promise<OperationalRestaurantReservationDetail | null> {
  assertUuid(bookingId, "bookingId");
  const actor = await resolveBusinessOperationActor(
    reference,
    "RESTAURANT_RESERVATION_OPERATE",
  );
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      branchServiceId: null,
      organizationId: actor.organizationId,
      restaurantReservation: { isNot: null },
      ...(actor.role === "RECEPTIONIST"
        ? { branch: { deletedAt: null, status: "ACTIVE" } }
        : {}),
    },
    include: detailInclude,
  });
  if (!booking) return null;
  const details = assertRestaurantRelationships(booking);
  const [user, tableOptions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: booking.customer.authUserId },
      select: { email: true },
    }),
    prisma.restaurantTable.findMany({
      where: {
        branchId: booking.branchId,
        businessId: actor.organizationId,
        isActive: true,
      },
      select: { area: true, capacity: true, id: true, name: true },
      orderBy: [{ capacity: "asc" }, { name: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    activity: booking.statusHistory.flatMap((entry) => {
      const event = safeOperationalActivity(entry);
      return event ? [{ createdAt: entry.createdAt.toISOString(), event, id: entry.id }] : [];
    }),
    bookingVersion: booking.updatedAt.toISOString(),
    branch: {
      id: booking.branch.id,
      name: booking.branch.name,
      timezone: booking.branch.timezone,
    },
    cancellation: {
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      reason: booking.cancellationReason,
    },
    customer: {
      email: user?.email ?? null,
      name: booking.customerNameSnapshot,
      phone: booking.customer.phone,
    },
    customerNote: details.customerNote,
    endsAt: booking.endsAt.toISOString(),
    guestCount: details.guestCount,
    id: booking.id,
    organizationName: booking.organization.name,
    permittedTransitions: availableOperationalBookingTransitions(booking),
    preorder: details.items.map((item) => ({
      currency: item.currencySnapshot ?? "IQD",
      id: item.id,
      name: item.itemNameSnapshot ?? item.menuItem.name,
      note: item.note,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
    })),
    reference: bookingReference(booking.id),
    reservationVersion: details.updatedAt.toISOString(),
    scope: actor.role === "RECEPTIONIST" ? "RECEPTIONIST" : "MANAGEMENT",
    seatingArea: details.seatingArea,
    startsAt: booking.startsAt.toISOString(),
    status: booking.status,
    table: {
      capacity: details.table.capacity,
      id: details.table.id,
      name: details.table.name,
    },
    tableOptions,
  };
}

function assertRestaurantOperationalState(booking: RestaurantOperationalBooking) {
  const details = assertRestaurantRelationships(booking);
  if (
    !ACTIVE_STATUSES.includes(booking.status as (typeof ACTIVE_STATUSES)[number]) ||
    booking.branch.deletedAt ||
    booking.branch.status !== "ACTIVE" ||
    booking.organization.deletedAt ||
    !booking.organization.isActive ||
    booking.organization.status !== "ACTIVE" ||
    !isRestaurantVertical(booking.organization.vertical)
  ) {
    businessOperationsError(
      "BOOKING_STATE_CONFLICT",
      "Restaurant reservation is not active and operable.",
    );
  }
  return details;
}

async function replayRestaurantReschedule(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay?.targetId) return null;
  const booking = await transaction.booking.findFirst({
    where: { id: replay.targetId, organizationId: actor.organizationId },
    include: { restaurantReservation: { select: { updatedAt: true } } },
  });
  const result = replay.result as { reservationVersion?: string } | null;
  if (
    !booking?.restaurantReservation ||
    booking.updatedAt.getTime() !== replay.resultVersion.getTime() ||
    booking.restaurantReservation.updatedAt.toISOString() !== result?.reservationVersion
  ) {
    businessOperationsError(
      "STALE_VERSION",
      "A later Restaurant reservation change superseded this replay.",
    );
  }
  return {
    bookingId: booking.id,
    bookingVersion: booking.updatedAt.toISOString(),
    replayed: true,
    reservationVersion: booking.restaurantReservation.updatedAt.toISOString(),
  };
}

export async function rescheduleOperationalRestaurantReservation(input: {
  actor: BusinessOperationActorReference;
  bookingId: string;
  contextOrganizationId: string;
  expectedBookingVersion: string;
  expectedReservationVersion: string;
  idempotencyKey: string;
  reservation: unknown;
}) {
  assertUuid(input.bookingId, "bookingId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalRestaurantRescheduleSchema.safeParse(input.reservation);
  if (!parsed.success) {
    businessOperationsError("INVALID_REQUEST", "Restaurant reschedule input is invalid.");
  }
  const actor = await resolveBusinessOperationActor(
    input.actor,
    "RESTAURANT_RESERVATION_OPERATE",
  );
  assertBusinessOperationMutationRate(actor, "restaurant-reschedule");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "RESTAURANT_RESCHEDULE",
    bookingId: input.bookingId,
    expectedBookingVersion: input.expectedBookingVersion,
    expectedReservationVersion: input.expectedReservationVersion,
    reservation: parsed.data,
  });
  const target = await prisma.booking.findFirst({
    where: { id: input.bookingId, organizationId: actor.organizationId },
    select: { branchId: true },
  });
  if (!target) {
    businessOperationsError("RESTAURANT_NOT_FOUND", "Restaurant reservation was not found.");
  }
  return runBusinessOperationTransaction(async (transaction) => {
    await lockBooking(transaction, input.bookingId, actor.organizationId);
    await lockRestaurantReservationDetails(transaction, input.bookingId);
    await lockRestaurantBranchAllocation(transaction, target.branchId);
    await assertBusinessOperationActorCurrent(
      transaction,
      actor,
      "RESTAURANT_RESERVATION_OPERATE",
    );
    const replay = await replayRestaurantReschedule(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const booking = await transaction.booking.findFirst({
      where: {
        id: input.bookingId,
        branchServiceId: null,
        organizationId: actor.organizationId,
        restaurantReservation: { isNot: null },
      },
      include: detailInclude,
    });
    if (!booking) {
      businessOperationsError("RESTAURANT_NOT_FOUND", "Restaurant reservation was not found.");
    }
    assertReceptionistBranch(actor, booking.branch);
    const details = assertRestaurantOperationalState(booking);
    assertExpectedVersion(booking.updatedAt, input.expectedBookingVersion);
    assertExpectedVersion(details.updatedAt, input.expectedReservationVersion);

    const now = new Date();
    const date = validateRestaurantDateRange(parsed.data.date, booking.branch.timezone, now);
    const startsAt = restaurantLocalTime(date, parsed.data.time, booking.branch.timezone);
    if (!startsAt) {
      businessOperationsError("SLOT_UNAVAILABLE", "Restaurant reservation time is invalid.");
    }
    const endsAt = new Date(startsAt.getTime() + details.durationMinutes * 60_000);
    if (
      startsAt <= now ||
      localDateForInstant(startsAt, booking.branch.timezone) !== parsed.data.date
    ) {
      businessOperationsError("SLOT_UNAVAILABLE", "Restaurant reservation time is invalid.");
    }
    const dayOfWeek = new Date(Date.UTC(date.year, date.month, date.day)).getUTCDay();
    const hours = booking.branch.businessHours.find(
      (row) => row.dayOfWeek === dayOfWeek && row.isOpen,
    );
    const opensAt = hours
      ? restaurantLocalTime(date, hours.openTime, booking.branch.timezone)
      : null;
    const closesAt = hours
      ? restaurantLocalTime(date, hours.closeTime, booking.branch.timezone)
      : null;
    if (
      !opensAt ||
      !closesAt ||
      startsAt < opensAt ||
      endsAt > closesAt ||
      (startsAt.getTime() - opensAt.getTime()) %
        (RESTAURANT_RESERVATION_INTERVAL_MINUTES * 60_000) !== 0
    ) {
      businessOperationsError("SLOT_UNAVAILABLE", "Restaurant is closed at the requested time.");
    }
    if (
      booking.branch.blockedTimes.some(
        (block) => startsAt < block.endsAt && endsAt > block.startsAt,
      )
    ) {
      businessOperationsError("SLOT_UNAVAILABLE", "Restaurant reservation time is blocked.");
    }
    const tables = await transaction.restaurantTable.findMany({
      where: {
        branchId: booking.branchId,
        businessId: actor.organizationId,
        isActive: true,
        capacity: { gte: parsed.data.guestCount },
        ...(parsed.data.seatingArea ? { area: parsed.data.seatingArea } : {}),
      },
      select: { area: true, capacity: true, id: true, name: true },
    });
    if (tables.length === 0) {
      businessOperationsError("TABLE_RESERVATION_CONFLICT", "No active table has sufficient capacity.");
    }
    const occupied = await transaction.booking.findMany({
      where: {
        branchId: booking.branchId,
        endsAt: { gt: startsAt },
        id: { not: booking.id },
        startsAt: { lt: endsAt },
        status: { in: [...ACTIVE_STATUSES] },
        restaurantReservation: { tableId: { in: tables.map((table) => table.id) } },
      },
      select: { restaurantReservation: { select: { tableId: true } } },
    });
    const occupiedIds = new Set(
      occupied.flatMap((row) => row.restaurantReservation ? [row.restaurantReservation.tableId] : []),
    );
    const available = tables.filter((table) => !occupiedIds.has(table.id));
    const table = parsed.data.tableId
      ? available.find((candidate) => candidate.id === parsed.data.tableId) ?? null
      : selectRestaurantTable(
          available,
          parsed.data.guestCount,
          parsed.data.seatingArea,
        );
    if (!table) {
      businessOperationsError(
        "TABLE_RESERVATION_CONFLICT",
        parsed.data.tableId
          ? "The selected table is unavailable, conflicting, or too small."
          : "No suitable table remains available for this time.",
      );
    }
    const finalArea = parsed.data.seatingArea ?? table.area;
    const timeChanged = startsAt.getTime() !== booking.startsAt.getTime();
    const tableOnly =
      !timeChanged &&
      parsed.data.guestCount === details.guestCount &&
      parsed.data.customerNote === details.customerNote &&
      finalArea === details.seatingArea &&
      table.id !== details.tableId;
    const unchanged =
      !timeChanged &&
      parsed.data.guestCount === details.guestCount &&
      parsed.data.customerNote === details.customerNote &&
      finalArea === details.seatingArea &&
      table.id === details.tableId;
    if (unchanged) {
      businessOperationsError("INVALID_REQUEST", "Restaurant reservation values are unchanged.");
    }
    const changedAt = new Date();
    const bookingChanged = await transaction.booking.updateMany({
      where: {
        id: booking.id,
        status: booking.status,
        updatedAt: booking.updatedAt,
      },
      data: {
        endsAt,
        notes: parsed.data.customerNote,
        startsAt,
        updatedAt: changedAt,
      },
    });
    const detailsChanged = await transaction.restaurantReservationDetails.updateMany({
      where: {
        id: details.id,
        updatedAt: details.updatedAt,
      },
      data: {
        customerNote: parsed.data.customerNote,
        guestCount: parsed.data.guestCount,
        reservationDateTime: startsAt,
        seatingArea: finalArea,
        tableId: table.id,
        updatedAt: changedAt,
      },
    });
    if (bookingChanged.count !== 1 || detailsChanged.count !== 1) {
      businessOperationsError(
        "BOOKING_STATE_CONFLICT",
        "Restaurant reservation changed while rescheduling was processed.",
      );
    }
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        changedByPersonId: actor.personId,
        fromStatus: booking.status,
        note: tableOnly ? "TABLE_REASSIGNED" : "RESTAURANT_RESCHEDULED",
        toStatus: booking.status,
      },
    });
    await createCustomerOperationalNotification(transaction, {
      bookingId: booking.id,
      businessId: actor.organizationId,
      customerId: booking.customerId,
      event: "restaurant.rescheduled",
      eventKey: `business-restaurant:${actor.organizationId}:${input.idempotencyKey}:rescheduled`,
    });
    await recordBusinessOperation(transaction, {
      action: tableOnly ? "RESTAURANT_TABLE_REASSIGN" : "RESTAURANT_RESCHEDULE",
      actor,
      after: {
        customerNote: parsed.data.customerNote,
        endsAt: endsAt.toISOString(),
        guestCount: parsed.data.guestCount,
        seatingArea: finalArea,
        startsAt: startsAt.toISOString(),
        tableId: table.id,
      },
      before: {
        customerNote: details.customerNote,
        endsAt: booking.endsAt.toISOString(),
        guestCount: details.guestCount,
        seatingArea: details.seatingArea,
        startsAt: booking.startsAt.toISOString(),
        tableId: details.tableId,
      },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { reservationVersion: changedAt.toISOString() },
      resultVersion: changedAt,
      targetId: booking.id,
      targetType: "Booking",
    });
    return {
      bookingId: booking.id,
      bookingVersion: changedAt.toISOString(),
      replayed: false,
      reservationVersion: changedAt.toISOString(),
    };
  });
}
