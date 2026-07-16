import "server-only";

import { TZDate } from "@date-fns/tz";
import type { BookingStatus, Prisma, SystemRole } from "@prisma/client";

import {
  businessCalendarCursorWhere,
  businessCalendarOrder,
  calendarScopeForRole,
  decodeBusinessCalendarCursor,
  DEFAULT_BUSINESS_CALENDAR_PAGE_SIZE,
  encodeBusinessCalendarCursor,
  MAX_BUSINESS_CALENDAR_PAGE_SIZE,
  normalizeBusinessCalendarStatus,
  normalizeBusinessCalendarType,
  normalizeBusinessCalendarView,
  availableOperationalBookingTransitions,
  type BusinessCalendarFilters,
  type BusinessCalendarScope,
  type BusinessCalendarView,
} from "@/features/business-operations/domain/daily-operations";
import {
  resolveBusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED"];

export interface OperationalCalendarSearchParams {
  branchId?: string;
  cursor?: string;
  date?: string;
  limit?: string;
  memberId?: string;
  serviceId?: string;
  status?: string;
  type?: string;
  view?: string;
}

interface CalendarBaseItem {
  branchName: string;
  customerName: string;
  endsAt: Date;
  id: string;
  serviceName: string;
  startsAt: Date;
  status: BookingStatus;
  timezone: string;
  type: "service" | "restaurant";
}

export interface StaffSelfCalendarItem extends CalendarBaseItem {
  notes: string | null;
  type: "service";
}

export interface OperationalCalendarItem extends CalendarBaseItem {
  cancellationReason: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  member: { id: string; name: string } | null;
  notes: string | null;
  pendingChangeRequest: {
    createdAt: Date;
    direction: "BUSINESS_TO_CUSTOMER" | "CUSTOMER_TO_BUSINESS";
    id: string;
    proposedEndsAt: Date;
    proposedStartsAt: Date;
  } | null;
  permittedTransitions: BookingStatus[];
  price: string;
  restaurantReservation: {
    guestCount: number;
    items: Array<{ name: string; quantity: number }>;
    seatingArea: string | null;
    tableName: string;
  } | null;
  version: string;
}

interface OperationalCalendarCommon {
  filters: BusinessCalendarFilters;
  nextCursor: string | null;
  nextDate: string;
  organizationId: string;
  organizationName: string;
  previousDate: string;
  role: SystemRole;
  selectedDate: string;
  snapshotAt: string;
  view: BusinessCalendarView;
}

export interface ManagementCalendarData extends OperationalCalendarCommon {
  bookings: OperationalCalendarItem[];
  options: {
    branches: Array<{ id: string; name: string }>;
    members: Array<{ id: string; name: string }>;
    services: Array<{ id: string; name: string }>;
  };
  scope: "MANAGEMENT";
  summary: OperationalCalendarSummary;
}

export interface ReceptionistCalendarData extends OperationalCalendarCommon {
  bookings: OperationalCalendarItem[];
  options: {
    branches: Array<{ id: string; name: string }>;
    members: Array<{ id: string; name: string }>;
    services: Array<{ id: string; name: string }>;
  };
  scope: "RECEPTIONIST";
  summary: OperationalCalendarSummary;
}

export interface StaffSelfCalendarData extends OperationalCalendarCommon {
  bookings: StaffSelfCalendarItem[];
  options: { branches: []; members: []; services: [] };
  scope: "STAFF_SELF";
  summary: null;
}

export type OperationalCalendarData =
  | ManagementCalendarData
  | ReceptionistCalendarData
  | StaffSelfCalendarData;

interface OperationalCalendarSummary {
  cancelled: number;
  completed: number;
  confirmed: number;
  pending: number;
  restaurantReservations: number;
  total: number;
}

function displayName(person: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return person.displayName ?? [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function localDate(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizedDate(value: string | undefined, timezone: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return localDate(timezone);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? value
    : localDate(timezone);
}

function shiftDate(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function dayRange(value: string, timezone: string) {
  const [year, month, day] = value.split("-").map(Number);
  return {
    startsAt: new Date(new TZDate(year, month - 1, day, 0, 0, 0, timezone)),
    endsAt: new Date(new TZDate(year, month - 1, day + 1, 0, 0, 0, timezone)),
  };
}

function viewWhere(
  view: BusinessCalendarView,
  range: ReturnType<typeof dayRange>,
  snapshotAt: Date,
  requestedStatus: BookingStatus | "all",
): Prisma.BookingWhereInput {
  const status = requestedStatus === "all" ? undefined : requestedStatus;
  if (view === "today") {
    return {
      startsAt: { gte: range.startsAt, lt: range.endsAt },
      ...(status ? { status } : {}),
    };
  }
  if (view === "upcoming") {
    return {
      startsAt: { gte: snapshotAt },
      status: status ?? { in: ACTIVE_BOOKING_STATUSES },
    };
  }
  if (view === "cancelled") {
    return status && status !== "CANCELLED"
      ? { AND: [{ status: "CANCELLED" }, { status }] }
      : { status: "CANCELLED" };
  }
  return {
    AND: [
      {
        OR: [
          { endsAt: { lt: snapshotAt } },
          { status: { in: ["COMPLETED", "NO_SHOW"] } },
        ],
      },
      { status: status ?? { not: "CANCELLED" } },
    ],
  };
}

function roleScopeWhere(
  organizationId: string,
  membershipId: string,
  scope: BusinessCalendarScope,
): Prisma.BookingWhereInput {
  if (scope === "STAFF_SELF") {
    return {
      memberId: membershipId,
      organizationId,
      restaurantReservation: { is: null },
      branch: {
        assignments: { some: { memberId: membershipId } },
        deletedAt: null,
        status: "ACTIVE",
      },
    };
  }
  if (scope === "RECEPTIONIST") {
    return {
      organizationId,
      branch: { deletedAt: null, status: "ACTIVE" },
    };
  }
  return { organizationId };
}

export async function listOperationalCalendar(
  reference: BusinessOperationActorReference,
  params: OperationalCalendarSearchParams,
): Promise<OperationalCalendarData> {
  const actor = await resolveBusinessOperationActor(reference, "BOOKING_READ");
  const scope = calendarScopeForRole(actor.role);
  const branches = await prisma.branch.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(scope === "MANAGEMENT" ? {} : { deletedAt: null, status: "ACTIVE" }),
      ...(scope === "STAFF_SELF"
        ? { assignments: { some: { memberId: actor.membershipId } } }
        : {}),
    },
    select: { id: true, name: true, timezone: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const branchIds = new Set(branches.map((branch) => branch.id));
  const branchId = params.branchId && branchIds.has(params.branchId) && scope !== "STAFF_SELF"
    ? params.branchId
    : "";
  const timezone =
    branches.find((branch) => branch.id === branchId)?.timezone ??
    branches[0]?.timezone ??
    "Asia/Baghdad";
  const selectedDate = normalizedDate(params.date, timezone);
  const view = normalizeBusinessCalendarView(params.view);
  const status = normalizeBusinessCalendarStatus(params.status);
  const type = normalizeBusinessCalendarType(params.type);

  let members: Array<{
    id: string;
    person: { displayName: string | null; firstName: string; lastName: string | null };
  }> = [];
  let services: Array<{ id: string; name: string }> = [];
  if (scope !== "STAFF_SELF") {
    [members, services] = await Promise.all([
        prisma.organizationMember.findMany({
          where: {
            deletedAt: null,
            organizationId: actor.organizationId,
            person: { deletedAt: null, status: "ACTIVE" },
            status: "ACTIVE",
          },
          select: { id: true, person: { select: { displayName: true, firstName: true, lastName: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        prisma.service.findMany({
          where: {
            organizationId: actor.organizationId,
            ...(scope === "RECEPTIONIST" ? { deletedAt: null, status: "ACTIVE" } : {}),
          },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
      ]);
  }
  const memberIds = new Set(members.map((member) => member.id));
  const serviceIds = new Set(services.map((service) => service.id));
  const memberId = params.memberId && memberIds.has(params.memberId) ? params.memberId : "";
  const serviceId = params.serviceId && serviceIds.has(params.serviceId) ? params.serviceId : "";
  const filters: BusinessCalendarFilters = {
    branchId,
    memberId,
    serviceId,
    status,
    type,
  };
  const binding = {
    filters,
    organizationId: actor.organizationId,
    role: actor.role,
    scope,
    selectedDate,
    view,
  };
  const decoded = params.cursor
    ? decodeBusinessCalendarCursor(params.cursor, binding)
    : null;
  const snapshotAt = decoded ? new Date(decoded.snapshotAt) : new Date();
  const range = dayRange(selectedDate, timezone);
  const limitValue = Number(params.limit ?? DEFAULT_BUSINESS_CALENDAR_PAGE_SIZE);
  const limit = Number.isInteger(limitValue)
    ? Math.min(Math.max(limitValue, 1), MAX_BUSINESS_CALENDAR_PAGE_SIZE)
    : DEFAULT_BUSINESS_CALENDAR_PAGE_SIZE;
  const scopeWhere = roleScopeWhere(actor.organizationId, actor.membershipId, scope);
  const filterWhere: Prisma.BookingWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(memberId ? { memberId } : {}),
    ...(serviceId ? { branchService: { serviceId } } : {}),
    ...(type === "service"
      ? { restaurantReservation: { is: null } }
      : type === "restaurant"
        ? { restaurantReservation: { isNot: null } }
        : {}),
  };
  const where: Prisma.BookingWhereInput = {
    AND: [
      scopeWhere,
      filterWhere,
      viewWhere(view, range, snapshotAt, status),
      { createdAt: { lte: snapshotAt } },
      ...(decoded ? [businessCalendarCursorWhere(view, decoded)] : []),
    ],
  };

  if (scope === "STAFF_SELF") {
    const rows = await prisma.booking.findMany({
      where,
      select: {
        branch: { select: { name: true, timezone: true } },
        customerNameSnapshot: true,
        endsAt: true,
        id: true,
        notes: true,
        serviceNameSnapshot: true,
        startsAt: true,
        status: true,
      },
      orderBy: [...businessCalendarOrder(view)],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return {
      bookings: page.map((booking) => ({
        branchName: booking.branch.name,
        customerName: booking.customerNameSnapshot,
        endsAt: booking.endsAt,
        id: booking.id,
        notes: booking.notes,
        serviceName: booking.serviceNameSnapshot,
        startsAt: booking.startsAt,
        status: booking.status,
        timezone: booking.branch.timezone,
        type: "service" as const,
      })),
      filters,
      nextCursor: hasMore && last
        ? encodeBusinessCalendarCursor({
            ...binding,
            id: last.id,
            snapshotAt: snapshotAt.toISOString(),
            startsAt: last.startsAt.toISOString(),
          })
        : null,
      nextDate: shiftDate(selectedDate, 1),
      options: { branches: [], members: [], services: [] },
      organizationId: actor.organizationId,
      organizationName: actor.organizationName,
      previousDate: shiftDate(selectedDate, -1),
      role: actor.role,
      scope,
      selectedDate,
      snapshotAt: snapshotAt.toISOString(),
      summary: null,
      view,
    };
  }

  const [rows, groupedStatus, restaurantReservations] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        branch: { select: { name: true, timezone: true } },
        customer: { select: { authUserId: true, phone: true } },
        member: {
          select: {
            id: true,
            person: { select: { displayName: true, firstName: true, lastName: true } },
          },
        },
        changeRequests: {
          where: { status: "PENDING" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            createdAt: true,
            id: true,
            proposedEndsAt: true,
            proposedStartsAt: true,
            requestedByPersonId: true,
          },
          take: 1,
        },
        restaurantReservation: {
          include: {
            items: { include: { menuItem: { select: { name: true } } } },
            table: { select: { name: true } },
          },
        },
      },
      orderBy: [...businessCalendarOrder(view)],
      take: limit + 1,
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: {
        AND: [
          scopeWhere,
          { startsAt: { gte: range.startsAt, lt: range.endsAt } },
          { createdAt: { lte: snapshotAt } },
        ],
      },
      _count: { _all: true },
    }),
    prisma.booking.count({
      where: {
        AND: [
          scopeWhere,
          { startsAt: { gte: range.startsAt, lt: range.endsAt } },
          { createdAt: { lte: snapshotAt } },
          { restaurantReservation: { isNot: null } },
        ],
      },
    }),
  ]);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const authUserIds = [...new Set(page.map((booking) => booking.customer.authUserId))];
  const users = authUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authUserIds } },
        select: { email: true, id: true },
      })
    : [];
  const emails = new Map(users.map((user) => [user.id, user.email]));
  const counts = new Map(groupedStatus.map((row) => [row.status, row._count._all]));
  const last = page.at(-1);
  const result = {
    bookings: page.map((booking): OperationalCalendarItem => {
      const request = booking.changeRequests[0];
      return {
        branchName: booking.branch.name,
        cancellationReason: booking.cancellationReason,
        customerEmail: emails.get(booking.customer.authUserId) ?? null,
        customerName: booking.customerNameSnapshot,
        customerPhone: booking.customer.phone,
        endsAt: booking.endsAt,
        id: booking.id,
        member: booking.member
          ? { id: booking.member.id, name: displayName(booking.member.person) }
          : null,
        notes: booking.notes,
        pendingChangeRequest: request
          ? {
              createdAt: request.createdAt,
              direction: request.requestedByPersonId === booking.customerId
                ? "CUSTOMER_TO_BUSINESS"
                : "BUSINESS_TO_CUSTOMER",
              id: request.id,
              proposedEndsAt: request.proposedEndsAt,
              proposedStartsAt: request.proposedStartsAt,
            }
          : null,
        permittedTransitions: availableOperationalBookingTransitions(booking),
        price: booking.priceSnapshot.toString(),
        restaurantReservation: booking.restaurantReservation
          ? {
              guestCount: booking.restaurantReservation.guestCount,
              items: booking.restaurantReservation.items.map((item) => ({
                name: item.itemNameSnapshot ?? item.menuItem.name,
                quantity: item.quantity,
              })),
              seatingArea: booking.restaurantReservation.seatingArea,
              tableName: booking.restaurantReservation.table.name,
            }
          : null,
        serviceName: booking.serviceNameSnapshot,
        startsAt: booking.startsAt,
        status: booking.status,
        timezone: booking.branch.timezone,
        type: booking.restaurantReservation ? "restaurant" : "service",
        version: booking.updatedAt.toISOString(),
      };
    }),
    filters,
    nextCursor: hasMore && last
      ? encodeBusinessCalendarCursor({
          ...binding,
          id: last.id,
          snapshotAt: snapshotAt.toISOString(),
          startsAt: last.startsAt.toISOString(),
        })
      : null,
    nextDate: shiftDate(selectedDate, 1),
    options: {
      branches: branches.map(({ id, name }) => ({ id, name })),
      members: members.map((member) => ({ id: member.id, name: displayName(member.person) })),
      services,
    },
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    previousDate: shiftDate(selectedDate, -1),
    role: actor.role,
    selectedDate,
    snapshotAt: snapshotAt.toISOString(),
    summary: {
      cancelled: counts.get("CANCELLED") ?? 0,
      completed: counts.get("COMPLETED") ?? 0,
      confirmed: counts.get("CONFIRMED") ?? 0,
      pending: counts.get("PENDING") ?? 0,
      restaurantReservations,
      total: [...counts.values()].reduce((sum, value) => sum + value, 0),
    },
    view,
  };
  return scope === "MANAGEMENT"
    ? { ...result, scope: "MANAGEMENT" }
    : { ...result, scope: "RECEPTIONIST" };
}
