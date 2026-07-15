import "server-only";

import { TZDate } from "@date-fns/tz";
import type { BookingStatus, Prisma } from "@prisma/client";

import { canOperateBookings } from "@/features/bookings/policies/booking-lifecycle";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED"];
const ALL_STATUSES: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
];
const CALENDAR_TYPES = ["all", "service", "restaurant"] as const;
const CALENDAR_VIEWS = ["today", "upcoming", "past", "cancelled"] as const;
const MAX_RESULTS = 80;

export type BusinessCalendarView = (typeof CALENDAR_VIEWS)[number];
export type BusinessCalendarType = (typeof CALENDAR_TYPES)[number];

export interface BusinessCalendarSearchParams {
  date?: string;
  view?: string;
  branchId?: string;
  memberId?: string;
  serviceId?: string;
  status?: string;
  type?: string;
}

export interface BusinessCalendarBookingItem {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceName: string;
  branchName: string;
  memberName: string | null;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  timezone: string;
  price: string;
  type: "service" | "restaurant";
  restaurantReservation: {
    guestCount: number;
    tableName: string;
    seatingArea: string | null;
    items: Array<{ name: string; quantity: number }>;
  } | null;
}

export interface BusinessCalendarFilterOption {
  id: string;
  name: string;
}

export interface BusinessCalendarData {
  selectedDate: string;
  previousDate: string;
  nextDate: string;
  view: BusinessCalendarView;
  filters: {
    branchId: string;
    memberId: string;
    serviceId: string;
    status: BookingStatus | "all";
    type: BusinessCalendarType;
  };
  options: {
    branches: BusinessCalendarFilterOption[];
    members: BusinessCalendarFilterOption[];
    services: BusinessCalendarFilterOption[];
  };
  summary: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    restaurantReservations: number;
  };
  bookings: BusinessCalendarBookingItem[];
  canOperate: boolean;
}

function getLocalDateString(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : date.toISOString().slice(0, 10);
}

function parseDateInput(value: string | undefined, timezone: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return getLocalDateString(timezone);
  }

  const [year, month, day] = value.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  const valid =
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day;

  return valid ? value : getLocalDateString(timezone);
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function getDayRange(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const startsAt = new Date(new TZDate(year, month - 1, day, 0, 0, 0, timezone));
  const endsAt = new Date(
    new TZDate(year, month - 1, day + 1, 0, 0, 0, timezone),
  );

  return { startsAt, endsAt };
}

function normalizeView(value: string | undefined): BusinessCalendarView {
  return CALENDAR_VIEWS.includes(value as BusinessCalendarView)
    ? (value as BusinessCalendarView)
    : "today";
}

function normalizeType(value: string | undefined): BusinessCalendarType {
  return CALENDAR_TYPES.includes(value as BusinessCalendarType)
    ? (value as BusinessCalendarType)
    : "all";
}

function normalizeStatus(value: string | undefined): BookingStatus | "all" {
  return ALL_STATUSES.includes(value as BookingStatus)
    ? (value as BookingStatus)
    : "all";
}

function formatName(person: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return (
    person.displayName ??
    [person.firstName, person.lastName].filter(Boolean).join(" ") ??
    person.firstName
  );
}

export async function getBusinessCalendarData(
  params: BusinessCalendarSearchParams,
): Promise<BusinessCalendarData> {
  const { membership } = await requireBusinessIdentity();
  const organizationId = membership.organizationId;
  const canOperate = canOperateBookings(membership.role.systemRole);

  const branches = await prisma.branch.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, timezone: true },
    orderBy: { name: "asc" },
  });
  const timezone = branches[0]?.timezone ?? "Asia/Baghdad";
  const selectedDate = parseDateInput(params.date, timezone);
  const dayRange = getDayRange(selectedDate, timezone);
  const view = normalizeView(params.view);
  const requestedStatus = normalizeStatus(params.status);
  const type = normalizeType(params.type);

  const branchIds = new Set(branches.map((branch) => branch.id));
  const branchId =
    params.branchId && branchIds.has(params.branchId) ? params.branchId : "";

  const [members, services] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        ...(membership.role.systemRole === "STAFF"
          ? { id: membership.id }
          : {}),
      },
      include: { person: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const memberIds = new Set(members.map((member) => member.id));
  const memberId =
    params.memberId && memberIds.has(params.memberId) ? params.memberId : "";
  const serviceIds = new Set(services.map((service) => service.id));
  const serviceId =
    params.serviceId && serviceIds.has(params.serviceId)
      ? params.serviceId
      : "";

  const scopedWhere: Prisma.BookingWhereInput = {
    organizationId,
    ...(membership.role.systemRole === "STAFF" ? { memberId: membership.id } : {}),
    ...(branchId ? { branchId } : {}),
    ...(memberId ? { memberId } : {}),
    ...(serviceId ? { branchService: { serviceId } } : {}),
    ...(requestedStatus !== "all" ? { status: requestedStatus } : {}),
    ...(type === "service"
      ? { restaurantReservation: { is: null } }
      : type === "restaurant"
        ? { restaurantReservation: { isNot: null } }
        : {}),
  };

  const dateWhere: Prisma.BookingWhereInput =
    view === "upcoming"
      ? {
          startsAt: { gte: new Date() },
          status:
            requestedStatus === "all" ? { in: ACTIVE_STATUSES } : requestedStatus,
        }
      : view === "past"
        ? {
            OR: [
              { endsAt: { lt: new Date() } },
              { status: { in: ["COMPLETED", "NO_SHOW"] } },
            ],
            status:
              requestedStatus === "all"
                ? { not: "CANCELLED" }
                : requestedStatus,
          }
        : view === "cancelled"
          ? { status: "CANCELLED" }
          : { startsAt: { gte: dayRange.startsAt, lt: dayRange.endsAt } };

  const summaryWhere: Prisma.BookingWhereInput = {
    organizationId,
    ...(membership.role.systemRole === "STAFF" ? { memberId: membership.id } : {}),
    startsAt: { gte: dayRange.startsAt, lt: dayRange.endsAt },
  };

  const [bookings, summaryRows] = await Promise.all([
    prisma.booking.findMany({
      where: { ...scopedWhere, ...dateWhere },
      include: {
        customer: true,
        branch: { select: { id: true, name: true, timezone: true } },
        member: { include: { person: true } },
        branchService: { include: { service: true } },
        restaurantReservation: {
          include: {
            table: true,
            items: { include: { menuItem: true } },
          },
        },
      },
      orderBy: { startsAt: view === "past" || view === "cancelled" ? "desc" : "asc" },
      take: MAX_RESULTS,
    }),
    prisma.booking.findMany({
      where: summaryWhere,
      select: {
        status: true,
        restaurantReservation: { select: { id: true } },
      },
      take: 500,
    }),
  ]);

  const customerAuthUserIds = [
    ...new Set(bookings.map((booking) => booking.customer.authUserId)),
  ];
  const users =
    customerAuthUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: customerAuthUserIds } },
          select: { id: true, email: true },
        })
      : [];
  const emailByAuthUserId = new Map(
    users.map((user) => [user.id, user.email] as const),
  );

  return {
    selectedDate,
    previousDate: shiftDate(selectedDate, -1),
    nextDate: shiftDate(selectedDate, 1),
    view,
    filters: {
      branchId,
      memberId,
      serviceId,
      status: requestedStatus,
      type,
    },
    options: {
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      members: members.map((member) => ({
        id: member.id,
        name: formatName(member.person),
      })),
      services,
    },
    summary: {
      total: summaryRows.length,
      pending: summaryRows.filter((booking) => booking.status === "PENDING")
        .length,
      confirmed: summaryRows.filter((booking) => booking.status === "CONFIRMED")
        .length,
      completed: summaryRows.filter((booking) => booking.status === "COMPLETED")
        .length,
      cancelled: summaryRows.filter((booking) => booking.status === "CANCELLED")
        .length,
      restaurantReservations: summaryRows.filter(
        (booking) => booking.restaurantReservation,
      ).length,
    },
    bookings: bookings.map((booking) => ({
      id: booking.id,
      customerName: booking.customerNameSnapshot,
      customerPhone: booking.customer.phone,
      customerEmail: emailByAuthUserId.get(booking.customer.authUserId) ?? null,
      serviceName: booking.serviceNameSnapshot,
      branchName: booking.branch.name,
      memberName: booking.member ? formatName(booking.member.person) : null,
      notes: booking.notes,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      timezone: booking.branch.timezone,
      price: booking.priceSnapshot.toString(),
      type: booking.restaurantReservation ? "restaurant" : "service",
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
    })),
    canOperate,
  };
}
