import "server-only";

import { restaurantReservationReference } from "@/features/restaurants/domain/reservation-policy";
import { prisma } from "@/lib/db/prisma";

export const restaurantReservationDetailInclude = {
  organization: true,
  branch: true,
  restaurantReservation: {
    include: { items: { include: { menuItem: true } } },
  },
} as const;

export async function getRestaurantReservationDetailForCustomer(
  customerId: string,
  bookingId: string,
) {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId,
      restaurantReservation: { isNot: null },
    },
    include: restaurantReservationDetailInclude,
  });
  return booking ? serializeRestaurantReservationDetail(booking) : null;
}

export function serializeRestaurantReservationDetail(booking: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  createdAt: Date;
  priceSnapshot: { toString(): string };
  organization: { name: string; slug: string };
  branch: { id: string; name: string; timezone: string };
  restaurantReservation: {
    guestCount: number;
    durationMinutes: number;
    seatingArea: string | null;
    customerNote: string | null;
    items: Array<{
      id: string;
      quantity: number;
      unitPrice: { toString(): string };
      menuItem: { id: string; name: string; currency: string };
    }>;
  } | null;
}) {
  const reservation = booking.restaurantReservation;
  if (!reservation) throw new Error("Restaurant reservation detail is missing.");
  return {
    id: booking.id,
    reference: restaurantReservationReference(booking.id),
    restaurant: {
      name: booking.organization.name,
      slug: booking.organization.slug,
    },
    branch: {
      id: booking.branch.id,
      name: booking.branch.name,
    },
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    timezone: booking.branch.timezone,
    guestCount: reservation.guestCount,
    seatingArea: reservation.seatingArea,
    durationMinutes: reservation.durationMinutes,
    status: booking.status,
    customerNote: reservation.customerNote,
    preorderTotal: booking.priceSnapshot.toString(),
    preorderItems: reservation.items.map((item) => ({
      id: item.id,
      itemId: item.menuItem.id,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      currency: item.menuItem.currency,
    })),
    createdAt: booking.createdAt.toISOString(),
  };
}
