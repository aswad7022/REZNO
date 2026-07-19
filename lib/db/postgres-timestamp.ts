import "server-only";

import { Prisma } from "@prisma/client";

export type ExactPostgresTimestamp = string & {
  readonly __exactPostgresTimestamp: unique symbol;
};

const EXACT_POSTGRES_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

/**
 * Parses the canonical UTC representation used by authenticated pagination
 * cursors. This deliberately does not construct a JavaScript Date: Date would
 * discard the final three PostgreSQL fractional digits.
 */
export function parseExactPostgresTimestamp(
  value: unknown,
): ExactPostgresTimestamp | null {
  if (typeof value !== "string") return null;
  const match = EXACT_POSTGRES_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = Number(rawSecond);
  if (
    year < 1
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
  ) return null;
  return value as ExactPostgresTimestamp;
}

export function compareExactPostgresTimestamps(
  left: ExactPostgresTimestamp,
  right: ExactPostgresTimestamp,
) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Fetches lossless database time through a fixed, parameter-free SQL shape. */
export async function getExactPostgresTime(
  transaction: Prisma.TransactionClient,
): Promise<ExactPostgresTimestamp> {
  const [row] = await transaction.$queryRaw<Array<{ authoritativeNow: string }>>(
    Prisma.sql`
      SELECT to_char(
        clock_timestamp() AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "authoritativeNow"
    `,
  );
  const timestamp = parseExactPostgresTimestamp(row?.authoritativeNow);
  if (!timestamp) throw new Error("Exact PostgreSQL transaction time is unavailable.");
  return timestamp;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
