import "server-only";

import { bookingReference } from "@/features/bookings/domain/creation";
import type { PersistedBookingDetail } from "@/features/bookings/types";
import { prisma } from "@/lib/db/prisma";

const bookingDetailInclude = {
  branch: true,
  member: { include: { person: true } },
  organization: true,
} as const;

export async function getBookingDetailForCustomer(
  customerId: string,
  bookingId: string,
): Promise<PersistedBookingDetail | null> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId,
      restaurantReservation: null,
    },
    include: bookingDetailInclude,
  });
  return booking ? serializePersistedBookingDetail(booking) : null;
}

export function serializePersistedBookingDetail(booking: {
  id: string;
  serviceNameSnapshot: string;
  startsAt: Date;
  endsAt: Date;
  status: PersistedBookingDetail["status"];
  priceSnapshot: { toString(): string };
  currency: string;
  paymentMethod: PersistedBookingDetail["paymentMethod"];
  paymentStatus: PersistedBookingDetail["paymentStatus"];
  createdAt: Date;
  branch: { name: string; timezone: string };
  organization: { name: string };
  member: { person: { displayName: string | null; firstName: string } } | null;
}): PersistedBookingDetail {
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
    currency: booking.currency,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  };
}
