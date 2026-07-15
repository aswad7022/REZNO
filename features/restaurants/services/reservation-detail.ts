import "server-only";

import { Prisma } from "@prisma/client";

import {
  canCustomerManageRestaurantReservation,
  restaurantReservationRelationshipsAreValid,
  restaurantReservationCancellationDeadline,
} from "@/features/restaurants/domain/reservation-management";
import { restaurantReservationReference } from "@/features/restaurants/domain/reservation-policy";
import type {
  CustomerRestaurantReservationDetail,
  CustomerRestaurantReservationItem,
} from "@/features/restaurants/types";
import { prisma } from "@/lib/db/prisma";

export const restaurantReservationDetailInclude =
  Prisma.validator<Prisma.BookingInclude>()({
    organization: { include: { settings: true } },
    branch: true,
    statusHistory: {
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    },
    restaurantReservation: {
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                businessId: true,
                name: true,
                currency: true,
              },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        table: { select: { branchId: true, businessId: true } },
      },
    },
  });

export const restaurantReservationListInclude =
  Prisma.validator<Prisma.BookingInclude>()({
    organization: { include: { settings: true } },
    branch: true,
    restaurantReservation: {
      include: {
        table: { select: { branchId: true, businessId: true } },
      },
    },
  });

type RestaurantReservationDetailBooking = Prisma.BookingGetPayload<{
  include: typeof restaurantReservationDetailInclude;
}>;

type RestaurantReservationListBooking = Prisma.BookingGetPayload<{
  include: typeof restaurantReservationListInclude;
}>;

export async function getRestaurantReservationDetailForCustomer(
  customerId: string,
  bookingId: string,
) {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId,
      branchServiceId: null,
      restaurantReservation: { isNot: null },
    },
    include: restaurantReservationDetailInclude,
  });
  return booking && restaurantReservationRelationshipsAreValid(booking)
    ? serializeRestaurantReservationDetail(booking)
    : null;
}

export function serializeRestaurantReservationListItem(
  booking: RestaurantReservationListBooking,
  now = new Date(),
): CustomerRestaurantReservationItem {
  const reservation = booking.restaurantReservation;
  if (!restaurantReservationRelationshipsAreValid(booking) || !reservation) {
    throw new Error("Restaurant reservation relationships are invalid.");
  }
  const cancellationWindowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  const eligible = canCustomerManageRestaurantReservation(
    {
      status: booking.status,
      startsAt: booking.startsAt,
      cancellationWindowHours,
    },
    now,
  );
  return {
    id: booking.id,
    reference: restaurantReservationReference(booking.id),
    restaurant: {
      name: booking.organization.name,
      slug: booking.organization.slug,
    },
    branch: { id: booking.branch.id, name: booking.branch.name },
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    timezone: booking.branch.timezone,
    guestCount: reservation.guestCount,
    seatingArea: reservation.seatingArea,
    durationMinutes: reservation.durationMinutes,
    status: booking.status,
    preorderTotal: booking.priceSnapshot.toString(),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    cancellation: {
      eligible,
      deadline: restaurantReservationCancellationDeadline(
        booking.startsAt,
        cancellationWindowHours,
      ).toISOString(),
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    },
    reschedule: {
      eligible,
      deadline: restaurantReservationCancellationDeadline(
        booking.startsAt,
        cancellationWindowHours,
      ).toISOString(),
    },
  };
}

export function serializeRestaurantReservationDetail(
  booking: RestaurantReservationDetailBooking,
  now = new Date(),
): CustomerRestaurantReservationDetail {
  const reservation = booking.restaurantReservation;
  if (!restaurantReservationRelationshipsAreValid(booking) || !reservation) {
    throw new Error("Restaurant reservation relationships are invalid.");
  }
  const item = serializeRestaurantReservationListItem(
    booking as RestaurantReservationListBooking,
    now,
  );
  return {
    ...item,
    customerNote: reservation.customerNote,
    preorderItems: reservation.items.map((preorder) => ({
      id: preorder.id,
      itemId: preorder.menuItemId,
      name: preorder.itemNameSnapshot ?? preorder.menuItem.name,
      quantity: preorder.quantity,
      unitPrice: preorder.unitPrice.toString(),
      currency: preorder.currencySnapshot ?? preorder.menuItem.currency,
    })),
    cancellation: {
      ...item.cancellation,
      reason: booking.cancellationReason,
    },
    statusHistory: booking.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
