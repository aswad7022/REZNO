const CANONICAL_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const LOCAL_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export const MERCHANT_ORDER_MAX_DATE_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

export type MerchantOrderDateFilterKey =
  | "createdFrom"
  | "createdTo"
  | "updatedFrom"
  | "updatedTo";

export const MERCHANT_ORDER_DATE_FILTER_KEYS: readonly MerchantOrderDateFilterKey[] = [
  "createdFrom",
  "createdTo",
  "updatedFrom",
  "updatedTo",
];

export function parseCanonicalMerchantOrderTimestamp(value: string) {
  const parts = CANONICAL_TIMESTAMP_PATTERN.exec(value);
  if (!parts || !validDateTimeParts(parts)) return null;
  const offsetHours = Number(parts[10] ?? 0);
  const offsetMinutes = Number(parts[11] ?? 0);
  if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function localMerchantOrderTimestampToCanonical(value: string) {
  const parts = LOCAL_TIMESTAMP_PATTERN.exec(value);
  if (!parts || !validDateTimeParts(parts)) return null;
  const milliseconds = Number((parts[7] ?? "").padEnd(3, "0"));
  const parsed = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    Number(parts[4]),
    Number(parts[5]),
    Number(parts[6] ?? 0),
    milliseconds,
  );
  if (
    parsed.getFullYear() !== Number(parts[1]) ||
    parsed.getMonth() !== Number(parts[2]) - 1 ||
    parsed.getDate() !== Number(parts[3]) ||
    parsed.getHours() !== Number(parts[4]) ||
    parsed.getMinutes() !== Number(parts[5]) ||
    parsed.getSeconds() !== Number(parts[6] ?? 0) ||
    parsed.getMilliseconds() !== milliseconds
  ) return null;
  return parsed.toISOString();
}

export function canonicalMerchantOrderTimestampToLocal(value: string | undefined) {
  if (!value) return "";
  const parsed = parseCanonicalMerchantOrderTimestamp(value);
  if (!parsed) return "";
  const milliseconds = parsed.getMilliseconds();
  return [
    `${parsed.getFullYear().toString().padStart(4, "0")}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`,
    milliseconds ? `.${milliseconds.toString().padStart(3, "0")}` : "",
  ].join("");
}

export function merchantOrderDateRangeError(from: Date | undefined, to: Date | undefined) {
  if (!from || !to) return null;
  if (from > to) return "ORDER" as const;
  if (to.getTime() - from.getTime() > MERCHANT_ORDER_MAX_DATE_RANGE_MS) return "TOO_WIDE" as const;
  return null;
}

export function merchantOrderNextHref(query: {
  actionableOnly?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  fulfillmentMethod?: string;
  fulfillmentStatus?: string;
  overduePending?: boolean;
  paymentStatus?: string;
  query?: string;
  queue: string;
  status?: string;
  updatedFrom?: Date;
  updatedTo?: Date;
}, cursor: string) {
  const output = new URLSearchParams();
  output.set("queue", query.queue);
  set(output, "q", query.query);
  set(output, "status", query.status);
  set(output, "fulfillmentStatus", query.fulfillmentStatus);
  set(output, "fulfillmentMethod", query.fulfillmentMethod);
  set(output, "paymentStatus", query.paymentStatus);
  set(output, "createdFrom", query.createdFrom?.toISOString());
  set(output, "createdTo", query.createdTo?.toISOString());
  set(output, "updatedFrom", query.updatedFrom?.toISOString());
  set(output, "updatedTo", query.updatedTo?.toISOString());
  if (query.actionableOnly !== undefined) output.set("actionable", String(query.actionableOnly));
  if (query.overduePending !== undefined) output.set("overdue", String(query.overduePending));
  output.set("cursor", cursor);
  return `/business/commerce/orders?${output}`;
}

function set(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) params.set(key, value);
}

function validDateTimeParts(parts: RegExpExecArray) {
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6] ?? 0);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 &&
    day <= daysInMonth(year, month) && hour <= 23 && minute <= 59 && second <= 59;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}
