import "server-only";

import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@prisma/client";

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"] as const;

export interface ReservationImpact {
  genericBookings: number;
  restaurantReservations: number;
  total: number;
}

function summarize(rows: Array<{ restaurantReservation: { id: string } | null }>): ReservationImpact {
  const restaurantReservations = rows.filter((row) => row.restaurantReservation).length;
  const genericBookings = rows.length - restaurantReservations;
  return { genericBookings, restaurantReservations, total: rows.length };
}

export async function futureReservationImpact(
  transaction: Prisma.TransactionClient,
  branchId: string,
  now = new Date(),
) {
  return summarize(await transaction.booking.findMany({
    where: { branchId, startsAt: { gt: now }, status: { in: [...ACTIVE_STATUSES] } },
    select: { restaurantReservation: { select: { id: true } } },
  }));
}

export async function intervalReservationImpact(
  transaction: Prisma.TransactionClient,
  branchId: string,
  startsAt: Date,
  endsAt: Date,
) {
  return summarize(await transaction.booking.findMany({
    where: {
      branchId,
      endsAt: { gt: startsAt },
      startsAt: { lt: endsAt },
      status: { in: [...ACTIVE_STATUSES] },
    },
    select: { restaurantReservation: { select: { id: true } } },
  }));
}

function localTime(value: Date, timezone: string) {
  const zoned = new TZDate(value, timezone);
  return {
    dayOfWeek: zoned.getDay(),
    time: `${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`,
  };
}

export async function hoursReservationImpact(
  transaction: Prisma.TransactionClient,
  input: {
    branchId: string;
    days: Array<{ closeTime: string; dayOfWeek: number; isOpen: boolean; openTime: string }>;
    now?: Date;
    timezone: string;
  },
) {
  const schedule = new Map(input.days.map((day) => [day.dayOfWeek, day]));
  const rows = await transaction.booking.findMany({
    where: {
      branchId: input.branchId,
      startsAt: { gt: input.now ?? new Date() },
      status: { in: [...ACTIVE_STATUSES] },
    },
    select: { endsAt: true, restaurantReservation: { select: { id: true } }, startsAt: true },
  });
  return summarize(rows.filter((row) => {
    const start = localTime(row.startsAt, input.timezone);
    const end = localTime(row.endsAt, input.timezone);
    const day = schedule.get(start.dayOfWeek);
    return !day || !day.isOpen || end.dayOfWeek !== start.dayOfWeek || start.time < day.openTime || end.time > day.closeTime;
  }));
}
