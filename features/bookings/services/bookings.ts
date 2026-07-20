import "server-only";

import {
  canCustomerCancelBooking,
  canCustomerRequestBookingChange,
} from "@/features/bookings/policies/booking-lifecycle";
import { requireCustomerIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { getOperationalBookingProposalTarget } from "@/features/business-operations/services/booking-operations";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type {
  BookingListItem,
  PublicOffering,
} from "@/features/bookings/types";

export async function getPublicOfferings(): Promise<PublicOffering[]> {
  const offerings = await prisma.branchService.findMany({
    where: {
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
      service: true,
      branch: { include: { organization: true } },
    },
    orderBy: { service: { name: "asc" } },
  });

  return offerings.map((offering) => ({
    id: offering.id,
    organizationName: offering.branch.organization.name,
    branchName: offering.branch.name,
    serviceName: offering.service.name,
    description: offering.service.description,
    price: offering.price.toString(),
    durationMinutes: offering.durationMinutes,
    timezone: offering.branch.timezone,
    staffSelectionMode: offering.service.staffSelectionMode,
  }));
}

function toListItem(booking: {
  id: string;
  customerId: string;
  updatedAt: Date;
  serviceNameSnapshot: string;
  customerNameSnapshot: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingListItem["status"];
  priceSnapshot: { toString(): string };
  currency: string;
  paymentMethod: BookingListItem["payment"]["method"];
  paymentStatus: BookingListItem["payment"]["status"];
  paymentIntents?: Array<{ id: string; status: BookingListItem["payment"]["intentStatus"] }>;
  branch: { name: string; timezone: string; phone: string | null };
  organization: {
    id: string;
    name: string;
    vertical: "BARBER" | "BEAUTY" | "CAFE" | "CLINIC" | "CONSULTANT" | "DENTIST" | "GYM" | "OTHER" | "RESTAURANT" | "SPA";
    profile?: { businessPhone: string | null } | null;
  };
  member: { person: { displayName: string | null; firstName: string } } | null;
  review?: {
    rating: number;
    comment: string | null;
    status: "VISIBLE" | "HIDDEN" | "FLAGGED";
    businessReply: string | null;
  } | null;
  restaurantReservation?: {
    guestCount: number;
    seatingArea: string | null;
    table: { name: string };
    items: Array<{
      quantity: number;
      itemNameSnapshot: string | null;
      menuItem: { name: string };
    }>;
  } | null;
  changeRequests?: Array<{
    createdAt: Date;
    id: string;
    requestedByPersonId: string;
    proposedStartsAt: Date;
    proposedEndsAt: Date;
    proposedMember: {
      person: { displayName: string | null; firstName: string };
    } | null;
  }>;
}): BookingListItem {
  return {
    id: booking.id,
    serviceName: booking.serviceNameSnapshot,
    customerName: booking.customerNameSnapshot,
    branchName: booking.branch.name,
    businessName: booking.organization.name,
    contactPhone:
      booking.branch.phone ?? booking.organization.profile?.businessPhone ?? null,
    memberName: booking.member?.person.displayName ?? booking.member?.person.firstName ?? null,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    price: booking.priceSnapshot.toString(),
    currency: booking.currency,
    payment: {
      intentId: booking.paymentIntents?.[0]?.id ?? null,
      intentStatus: booking.paymentIntents?.[0]?.status ?? null,
      method: booking.paymentMethod,
      status: booking.paymentStatus,
    },
    timezone: booking.branch.timezone,
    organizationId: booking.organization.id,
    version: booking.updatedAt.toISOString(),
    review: booking.review ?? null,
    restaurantReservation: booking.restaurantReservation
      ? {
          guestCount: booking.restaurantReservation.guestCount,
          tableName: booking.restaurantReservation.table.name,
          seatingArea: booking.restaurantReservation.seatingArea,
          items: booking.restaurantReservation.items.map((item) => ({
            name: item.itemNameSnapshot ?? item.menuItem.name,
            quantity: item.quantity,
          })),
        }
      : null,
    pendingChange: booking.changeRequests?.[0]
      ? {
          createdAt: booking.changeRequests[0].createdAt.toISOString(),
          id: booking.changeRequests[0].id,
          startsAt: booking.changeRequests[0].proposedStartsAt,
          endsAt: booking.changeRequests[0].proposedEndsAt,
          memberName:
            booking.changeRequests[0].proposedMember?.person.displayName ??
            booking.changeRequests[0].proposedMember?.person.firstName ??
            null,
          requestedByCustomer:
            booking.changeRequests[0].requestedByPersonId === booking.customerId,
        }
      : null,
  };
}

function withCustomerPermissions(
  item: BookingListItem,
  booking: {
    status: BookingListItem["status"];
    startsAt: Date;
    organization: {
      vertical: "BARBER" | "BEAUTY" | "CAFE" | "CLINIC" | "CONSULTANT" | "DENTIST" | "GYM" | "OTHER" | "RESTAURANT" | "SPA";
      settings?: { cancellationWindowHours: number | null } | null;
    };
    review?: { rating: number; comment: string | null } | null;
    restaurantReservation?: { id: string } | null;
  },
): BookingListItem {
  const cancellationWindowHours =
    booking.organization.settings?.cancellationWindowHours;

  return {
    ...item,
    canCustomerCancel:
      !booking.restaurantReservation &&
      canCustomerCancelBooking({
        status: booking.status,
        startsAt: booking.startsAt,
        cancellationWindowHours,
      }),
    canCustomerReschedule:
      !booking.restaurantReservation &&
      canCustomerRequestBookingChange({
        status: booking.status,
        startsAt: booking.startsAt,
        cancellationWindowHours,
      }),
    canCustomerReview:
      booking.status === "COMPLETED" &&
      !booking.review &&
      !booking.restaurantReservation &&
      booking.organization.vertical !== "RESTAURANT" &&
      booking.organization.vertical !== "CAFE",
  };
}

export async function getCustomerBookings(
  filter: "all" | "upcoming" | "history" = "all",
): Promise<BookingListItem[]> {
  const { person } = await requireCustomerIdentity();
  const nowDate = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      customerId: person.id,
      ...(filter === "upcoming"
        ? {
            startsAt: { gte: nowDate },
            status: { in: ["PENDING", "CONFIRMED"] },
          }
        : filter === "history"
          ? {
              OR: [
                { startsAt: { lt: nowDate } },
                { status: { notIn: ["PENDING", "CONFIRMED"] } },
              ],
            }
          : {}),
    },
    include: {
      branch: true,
      member: { include: { person: true } },
      organization: { include: { settings: true, profile: true } },
      review: true,
      restaurantReservation: {
        include: {
          table: true,
          items: { include: { menuItem: true } },
        },
      },
      changeRequests: {
        where: { status: "PENDING" },
        include: { proposedMember: { include: { person: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      paymentIntents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, status: true },
        take: 1,
      },
    },
    orderBy: { startsAt: filter === "upcoming" ? "asc" : "desc" },
  });
  return bookings.map((booking) =>
    withCustomerPermissions(toListItem(booking), booking),
  );
}

export async function getCustomerBookingDetails(
  bookingId: string,
): Promise<BookingListItem | null> {
  const { person } = await requireCustomerIdentity();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(bookingId)) {
    return null;
  }

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId: person.id,
    },
    include: {
      branch: true,
      member: { include: { person: true } },
      organization: { include: { settings: true, profile: true } },
      review: true,
      restaurantReservation: {
        include: {
          table: true,
          items: { include: { menuItem: true } },
        },
      },
      changeRequests: {
        where: { status: "PENDING" },
        include: { proposedMember: { include: { person: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      paymentIntents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, status: true },
        take: 1,
      },
    },
  });

  if (!booking) return null;

  return withCustomerPermissions(toListItem(booking), booking);
}

export async function getCustomerBookingForReschedule(bookingId: string) {
  const { person } = await requireCustomerIdentity();
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId: person.id,
      branchServiceId: { not: null },
      restaurantReservation: null,
    },
    include: {
      branch: true,
      branchService: { include: { service: true } },
      organization: { include: { settings: true } },
    },
  });
  if (!booking || !booking.branchService || !booking.branchServiceId) return null;

  const canReschedule = canCustomerRequestBookingChange({
    status: booking.status,
    startsAt: booking.startsAt,
    cancellationWindowHours:
      booking.organization.settings?.cancellationWindowHours,
  });

  return {
    id: booking.id,
    branchServiceId: booking.branchServiceId,
    serviceName: booking.serviceNameSnapshot,
    branchName: booking.branch.name,
    timezone: booking.branch.timezone,
    staffSelectionMode: booking.branchService.service.staffSelectionMode,
    canReschedule,
  };
}

export async function getBusinessBookingForChange(bookingId: string) {
  return getOperationalBookingProposalTarget(
    await currentBusinessOperationReference("BOOKING_CHANGE_PROPOSE"),
    bookingId,
  );
}
