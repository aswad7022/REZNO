import "server-only";

import { Prisma } from "@prisma/client";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { RestaurantReservationError, restaurantReservationError } from "@/features/restaurants/domain/reservation-errors";
import {
  localDateForInstant,
  normalizeRestaurantNote,
  normalizeRestaurantPreorder,
  restaurantLocalTime,
  restaurantReservationRequestHash,
  RESTAURANT_RESERVATION_DURATION_MINUTES,
  RESTAURANT_RESERVATION_INTERVAL_MINUTES,
  selectRestaurantTable,
  validateRestaurantDateRange,
  validateRestaurantGuestCount,
  type RestaurantReservationPreorderInput,
  type RestaurantReservationSelection,
} from "@/features/restaurants/domain/reservation-policy";
import {
  restaurantReservationDetailInclude,
  serializeRestaurantReservationDetail,
} from "@/features/restaurants/services/reservation-detail";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED"] as const;
const MAX_SERIALIZABLE_ATTEMPTS = 4;

export interface CreateRestaurantReservationInput {
  businessSlug: string;
  branchId: string;
  customerId: string;
  customerNote: string | null;
  date: string;
  guestCount: number;
  idempotencyKey: string;
  preorderItems: readonly RestaurantReservationPreorderInput[];
  seatingArea: string | null;
  startsAt: string;
}

function canonicalSelection(
  input: CreateRestaurantReservationInput,
): RestaurantReservationSelection {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.idempotencyKey,
    )
  ) {
    restaurantReservationError("INVALID_REQUEST", "Idempotency key must be a UUID.");
  }
  const businessSlug = input.businessSlug.trim().toLowerCase();
  const seatingArea = input.seatingArea?.trim() || null;
  const startsAt = input.startsAt.trim();
  const parsedStartsAt = new Date(startsAt);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug) ||
    businessSlug.length > 160 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.branchId,
    ) ||
    (seatingArea?.length ?? 0) > 120
  ) {
    restaurantReservationError("INVALID_REQUEST", "Restaurant selection is invalid.");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startsAt) ||
    !Number.isFinite(parsedStartsAt.getTime()) ||
    parsedStartsAt.toISOString() !== startsAt
  ) {
    restaurantReservationError(
      "INVALID_REQUEST",
      "startsAt must be a canonical UTC timestamp.",
    );
  }
  return {
    businessSlug,
    branchId: input.branchId,
    customerNote: normalizeRestaurantNote(input.customerNote),
    date: input.date,
    durationMinutes: RESTAURANT_RESERVATION_DURATION_MINUTES,
    guestCount: validateRestaurantGuestCount(input.guestCount),
    preorderItems: normalizeRestaurantPreorder(input.preorderItems),
    seatingArea,
    startsAt,
  };
}

function isRetryableTransactionError(error: unknown) {
  if (error instanceof RestaurantReservationError) return false;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) return true;
  if (error instanceof Error) {
    return /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(error.message);
  }
  if (typeof error === "object" && error !== null && "cause" in error) {
    const cause = error.cause;
    if (typeof cause === "object" && cause !== null) {
      const code = "originalCode" in cause ? String(cause.originalCode) : "";
      const kind = "kind" in cause ? String(cause.kind) : "";
      return code === "40001" || code === "40P01" || kind === "TransactionWriteConflict";
    }
  }
  return false;
}

async function replayExistingReservation(
  customerId: string,
  idempotencyKey: string,
  requestHash: string,
) {
  const existing = await prisma.booking.findFirst({
    where: {
      customerId,
      creationIdempotencyKey: idempotencyKey,
    },
    include: restaurantReservationDetailInclude,
  });
  if (!existing) return null;
  if (!existing.restaurantReservation) {
    restaurantReservationError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key is already used by another booking domain.",
    );
  }
  if (existing.creationRequestHash !== requestHash) {
    restaurantReservationError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used for a different restaurant reservation.",
    );
  }
  return {
    reservation: serializeRestaurantReservationDetail(existing),
    replayed: true,
  };
}

export async function createCustomerRestaurantReservation(
  input: CreateRestaurantReservationInput,
) {
  const selection = canonicalSelection(input);
  const requestHash = restaurantReservationRequestHash(selection);
  const replay = await replayExistingReservation(
    input.customerId,
    input.idempotencyKey,
    requestHash,
  );
  if (replay) return replay;

  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.booking.findFirst({
            where: {
              customerId: input.customerId,
              creationIdempotencyKey: input.idempotencyKey,
            },
            include: restaurantReservationDetailInclude,
          });
          if (existing) {
            if (!existing.restaurantReservation) {
              restaurantReservationError(
                "IDEMPOTENCY_CONFLICT",
                "Idempotency key is already used by another booking domain.",
              );
            }
            if (existing.creationRequestHash !== requestHash) {
              restaurantReservationError(
                "IDEMPOTENCY_CONFLICT",
                "Idempotency key was already used for a different restaurant reservation.",
              );
            }
            return {
              reservation: serializeRestaurantReservationDetail(existing),
              replayed: true,
            };
          }

          const customer = await transaction.person.findFirst({
            where: {
              id: input.customerId,
              deletedAt: null,
              isOnboarded: true,
              phone: { not: null },
              status: "ACTIVE",
            },
          });
          if (!customer || !customer.phone?.trim()) {
            restaurantReservationError(
              "CUSTOMER_UNAVAILABLE",
              "An active, onboarded customer with a completed phone number is required.",
            );
          }

          const branchIdentity = await transaction.branch.findFirst({
            where: {
              id: selection.branchId,
              organization: { slug: selection.businessSlug },
            },
            select: { id: true },
          });
          if (!branchIdentity) {
            restaurantReservationError("NOT_FOUND", "Restaurant branch was not found.");
          }
          await transaction.$queryRaw(
            Prisma.sql`
              SELECT 1::int AS "locked"
              FROM (
                SELECT pg_advisory_xact_lock(
                  hashtextextended(${`restaurant-reservation:${branchIdentity.id}`}, 0)
                )
              ) AS "reservationLock"
            `,
          );

          const branch = await transaction.branch.findFirst({
            where: {
              id: selection.branchId,
              deletedAt: null,
              status: "ACTIVE",
              organization: {
                slug: selection.businessSlug,
                deletedAt: null,
                isActive: true,
                status: "ACTIVE",
                settings: { bookingEnabled: true, marketplaceVisible: true },
              },
            },
            include: {
              businessHours: true,
              blockedTimes: { where: { memberId: null } },
              organization: {
                include: {
                  restaurantTables: {
                    where: { branchId: selection.branchId, isActive: true },
                    select: { id: true, name: true, capacity: true, area: true },
                  },
                },
              },
            },
          });
          if (!branch) {
            restaurantReservationError("NOT_FOUND", "Restaurant branch was not found.");
          }
          if (!isRestaurantVertical(branch.organization.vertical)) {
            restaurantReservationError(
              "RESTAURANT_FLOW_REQUIRED",
              "This business does not support restaurant reservations.",
            );
          }

          const now = new Date();
          const parsedDate = validateRestaurantDateRange(
            selection.date,
            branch.timezone,
            now,
          );
          const startsAt = new Date(selection.startsAt);
          const endsAt = new Date(
            startsAt.getTime() + RESTAURANT_RESERVATION_DURATION_MINUTES * 60_000,
          );
          if (
            startsAt <= now ||
            localDateForInstant(startsAt, branch.timezone) !== selection.date
          ) {
            restaurantReservationError("DATE_OUT_OF_RANGE", "Reservation time is invalid or in the past.");
          }
          const dayOfWeek = new Date(
            Date.UTC(parsedDate.year, parsedDate.month, parsedDate.day),
          ).getUTCDay();
          const hours = branch.businessHours.find(
            (value) => value.dayOfWeek === dayOfWeek && value.isOpen,
          );
          const opensAt = hours
            ? restaurantLocalTime(parsedDate, hours.openTime, branch.timezone)
            : null;
          const closesAt = hours
            ? restaurantLocalTime(parsedDate, hours.closeTime, branch.timezone)
            : null;
          if (!hours || !opensAt || !closesAt || opensAt >= closesAt) {
            restaurantReservationError("RESTAURANT_CLOSED", "Restaurant is closed on this date.");
          }
          if (
            startsAt < opensAt ||
            endsAt > closesAt ||
            (startsAt.getTime() - opensAt.getTime()) %
              (RESTAURANT_RESERVATION_INTERVAL_MINUTES * 60_000) !==
              0
          ) {
            restaurantReservationError(
              "RESTAURANT_CLOSED",
              "Reservation must start on an available interval and finish before closing.",
            );
          }
          if (
            branch.blockedTimes.some(
              (block) => startsAt < block.endsAt && endsAt > block.startsAt,
            )
          ) {
            restaurantReservationError("TABLE_CONFLICT", "Reservation time is blocked.");
          }

          const seatingAreas = new Set(
            branch.organization.restaurantTables.flatMap((table) => table.area ? [table.area] : []),
          );
          if (selection.seatingArea && !seatingAreas.has(selection.seatingArea)) {
            restaurantReservationError(
              "CAPACITY_UNAVAILABLE",
              "Requested seating area is not available at this branch.",
            );
          }
          const capacityTables = branch.organization.restaurantTables.filter(
            (table) =>
              table.capacity >= selection.guestCount &&
              (!selection.seatingArea || table.area === selection.seatingArea),
          );
          if (capacityTables.length === 0) {
            restaurantReservationError(
              "CAPACITY_UNAVAILABLE",
              "No active table can accommodate this guest count.",
            );
          }
          const occupied = await transaction.booking.findMany({
            where: {
              status: { in: [...ACTIVE_RESERVATION_STATUSES] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              restaurantReservation: {
                tableId: { in: capacityTables.map((table) => table.id) },
              },
            },
            select: { restaurantReservation: { select: { tableId: true } } },
          });
          const occupiedTableIds = new Set(
            occupied.flatMap((booking) =>
              booking.restaurantReservation ? [booking.restaurantReservation.tableId] : [],
            ),
          );
          const table = selectRestaurantTable(
            capacityTables.filter((candidate) => !occupiedTableIds.has(candidate.id)),
            selection.guestCount,
            selection.seatingArea,
          );
          if (!table) {
            restaurantReservationError(
              "TABLE_CONFLICT",
              "No suitable table remains available for this time.",
            );
          }

          const requestedItemIds = selection.preorderItems.map((item) => item.itemId);
          const menuItems = requestedItemIds.length
            ? await transaction.menuItem.findMany({
                where: {
                  id: { in: requestedItemIds },
                  businessId: branch.organization.id,
                  isAvailable: true,
                  category: {
                    businessId: branch.organization.id,
                    isActive: true,
                  },
                },
                select: { id: true, name: true, price: true },
              })
            : [];
          if (menuItems.length !== requestedItemIds.length) {
            restaurantReservationError(
              "MENU_ITEM_UNAVAILABLE",
              "One or more preorder items are unavailable.",
            );
          }
          const menuById = new Map(menuItems.map((item) => [item.id, item]));
          const reservationItems = selection.preorderItems.map((item) => ({
            menuItemId: item.itemId,
            quantity: item.quantity,
            unitPrice: menuById.get(item.itemId)!.price,
          }));
          const preorderTotal = reservationItems.reduce(
            (total, item) => total.plus(item.unitPrice.times(item.quantity)),
            new Prisma.Decimal(0),
          );
          const customerName =
            customer.displayName ??
            [customer.firstName, customer.lastName].filter(Boolean).join(" ");
          const booking = await transaction.booking.create({
            data: {
              organizationId: branch.organization.id,
              branchId: branch.id,
              branchServiceId: null,
              customerId: customer.id,
              memberId: null,
              status: "CONFIRMED",
              startsAt,
              endsAt,
              serviceNameSnapshot: "Restaurant reservation",
              customerNameSnapshot: customerName,
              priceSnapshot: preorderTotal,
              notes: selection.customerNote,
              creationIdempotencyKey: input.idempotencyKey,
              creationRequestHash: requestHash,
              statusHistory: {
                create: {
                  toStatus: "CONFIRMED",
                  changedByPersonId: customer.id,
                  note: "Restaurant reservation created by customer.",
                },
              },
              restaurantReservation: {
                create: {
                  businessId: branch.organization.id,
                  branchId: branch.id,
                  tableId: table.id,
                  guestCount: selection.guestCount,
                  reservationDateTime: startsAt,
                  durationMinutes: RESTAURANT_RESERVATION_DURATION_MINUTES,
                  seatingArea: table.area,
                  customerNote: selection.customerNote,
                  items: reservationItems.length
                    ? { create: reservationItems }
                    : undefined,
                },
              },
            },
            include: restaurantReservationDetailInclude,
          });
          await transaction.notification.create({
            data: {
              audience: "BUSINESS",
              businessId: branch.organization.id,
              priority: "IMPORTANT",
              eventKey: `restaurant-reservation:${booking.id}:created`,
              title: "New restaurant reservation",
              body: `${customerName} reserved for ${selection.guestCount} guests.`,
              metadata: {
                bookingId: booking.id,
                event: "restaurant.reservation.created",
              },
            },
          });
          return {
            reservation: serializeRestaurantReservationDetail(booking),
            replayed: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replayAfterRace = await replayExistingReservation(
          input.customerId,
          input.idempotencyKey,
          requestHash,
        );
        if (replayAfterRace) return replayAfterRace;
      }
      if (!isRetryableTransactionError(error)) throw error;
      if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
        restaurantReservationError(
          "TABLE_CONFLICT",
          "Reservation could not be completed safely after bounded retries.",
          { attempts: MAX_SERIALIZABLE_ATTEMPTS },
        );
      }
    }
  }
  restaurantReservationError("TABLE_CONFLICT", "Reservation could not be completed safely.");
}
