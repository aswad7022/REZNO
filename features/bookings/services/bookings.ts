import "server-only";

import { canOperateBookings } from "@/features/bookings/policies/booking-lifecycle";
import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type {
  BookingListItem,
  PublicOffering,
} from "@/features/bookings/types";

export async function getPublicOfferings(): Promise<PublicOffering[]> {
  const offerings = await prisma.branchService.findMany({
    where: {
      isAvailable: true,
      service: { status: "ACTIVE" },
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
  serviceNameSnapshot: string;
  customerNameSnapshot: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingListItem["status"];
  priceSnapshot: { toString(): string };
  branch: { name: string; timezone: string; phone: string | null };
  organization: {
    name: string;
    profile?: { businessPhone: string | null } | null;
  };
  member: { person: { displayName: string | null; firstName: string } } | null;
  review?: { rating: number; comment: string | null } | null;
  restaurantReservation?: {
    guestCount: number;
    seatingArea: string | null;
    table: { name: string };
    items: Array<{
      quantity: number;
      menuItem: { name: string };
    }>;
  } | null;
  changeRequests?: Array<{
    id: string;
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
    timezone: booking.branch.timezone,
    review: booking.review ?? null,
    restaurantReservation: booking.restaurantReservation
      ? {
          guestCount: booking.restaurantReservation.guestCount,
          tableName: booking.restaurantReservation.table.name,
          seatingArea: booking.restaurantReservation.seatingArea,
          items: booking.restaurantReservation.items.map((item) => ({
            name: item.menuItem.name,
            quantity: item.quantity,
          })),
        }
      : null,
    pendingChange: booking.changeRequests?.[0]
      ? {
          id: booking.changeRequests[0].id,
          startsAt: booking.changeRequests[0].proposedStartsAt,
          endsAt: booking.changeRequests[0].proposedEndsAt,
          memberName:
            booking.changeRequests[0].proposedMember?.person.displayName ??
            booking.changeRequests[0].proposedMember?.person.firstName ??
            null,
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
      settings?: { cancellationWindowHours: number | null } | null;
    };
    review?: { rating: number; comment: string | null } | null;
  },
): BookingListItem {
  const windowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  const isActive =
    booking.status === "PENDING" || booking.status === "CONFIRMED";
  const canChange =
    isActive && Date.now() < booking.startsAt.getTime() - windowHours * 3_600_000;

  return {
    ...item,
    canCustomerCancel: canChange,
    canCustomerReschedule: canChange,
    canCustomerReview: booking.status === "COMPLETED" && !booking.review,
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
    },
  });

  if (!booking) return null;

  return withCustomerPermissions(toListItem(booking), booking);
}

export async function getBusinessBookings(options?: {
  calendar?: boolean;
}): Promise<{ bookings: BookingListItem[]; canOperate: boolean }> {
  const { membership } = await requireBusinessIdentity();
  const now = new Date();
  const calendarRange = options?.calendar
    ? {
        gte: new Date(now.getTime() - 86_400_000),
        lt: new Date(now.getTime() + 31 * 86_400_000),
      }
    : undefined;
  const bookings = await prisma.booking.findMany({
    where: {
      organizationId: membership.organizationId,
      ...(membership.role.systemRole === "STAFF"
        ? { memberId: membership.id }
        : {}),
      startsAt: calendarRange,
    },
    include: {
      branch: true,
      member: { include: { person: true } },
      organization: { include: { profile: true } },
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
    },
    orderBy: { startsAt: options?.calendar ? "asc" : "desc" },
  });
  return {
    bookings: bookings.map(toListItem),
    canOperate: canOperateBookings(membership.role.systemRole),
  };
}

export async function getCustomerBookingForReschedule(bookingId: string) {
  const { person } = await requireCustomerIdentity();
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId: person.id },
    include: {
      branch: true,
      branchService: { include: { service: true } },
      organization: { include: { settings: true } },
    },
  });
  if (!booking) return null;

  const windowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  const canReschedule =
    (booking.status === "PENDING" || booking.status === "CONFIRMED") &&
    Date.now() < booking.startsAt.getTime() - windowHours * 3_600_000;

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
  const { membership } = await requireBusinessIdentity();
  if (!canOperateBookings(membership.role.systemRole)) return null;

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      organizationId: membership.organizationId,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: {
      branch: true,
      branchService: { include: { service: true } },
    },
  });
  if (!booking) return null;

  return {
    id: booking.id,
    branchServiceId: booking.branchServiceId,
    serviceName: booking.serviceNameSnapshot,
    customerName: booking.customerNameSnapshot,
    branchName: booking.branch.name,
    timezone: booking.branch.timezone,
    staffSelectionMode: booking.branchService.service.staffSelectionMode,
  };
}
