import { createHash } from "node:crypto";
import { z } from "zod";

import {
  canonicalRequestJson,
  type CanonicalValue,
} from "@/features/commerce/domain/idempotency";

export const operationEnvelopeSchema = z.object({
  contextOrganizationId: z.string().uuid(),
  expectedVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
}).strict();

export const createOperationEnvelopeSchema = operationEnvelopeSchema.omit({
  expectedVersion: true,
});

export const operationalSettingsSchema = z.object({
  bookingEnabled: z.boolean(),
  cancellationWindowHours: z.number().int().min(0).max(720),
  marketplaceVisible: z.boolean(),
}).strict();

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable();

export function isValidIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const operationalBranchSchema = z.object({
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(120),
  country: optionalText(120),
  email: z.string().trim().email().max(320).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  locationInstructions: optionalText(240),
  locationLabel: optionalText(160),
  longitude: z.number().min(-180).max(180).nullable(),
  name: z.string().trim().min(2).max(120),
  nearbyLandmark: optionalText(160),
  phone: z.string().trim().max(30).regex(/^\+?[0-9\s()-]{7,30}$/).nullable(),
  timezone: z.string().trim().min(1).max(100).refine(isValidIanaTimezone),
}).strict().refine(
  (value) => (value.latitude === null) === (value.longitude === null),
  { path: ["latitude"], message: "Latitude and longitude must be provided together." },
);

const canonicalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const operationalHoursDaySchema = z.object({
  closeTime: canonicalTime,
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  openTime: canonicalTime,
}).strict().refine(
  (value) => !value.isOpen || value.openTime < value.closeTime,
  { path: ["closeTime"], message: "Opening time must be before closing time." },
);

export const operationalHoursSchema = z.object({
  days: z.array(operationalHoursDaySchema).length(7).superRefine((days, context) => {
    const values = days.map((day) => day.dayOfWeek);
    if (new Set(values).size !== 7 || values.some((day) => ![0, 1, 2, 3, 4, 5, 6].includes(day))) {
      context.addIssue({ code: "custom", message: "Each weekday must appear exactly once." });
    }
  }),
}).strict();

export const blockLocalInputSchema = z.object({
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reason: z.string().trim().max(500).nullable(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
}).strict();

export function hashBusinessOperation(value: CanonicalValue) {
  return createHash("sha256").update(canonicalRequestJson(value)).digest("hex");
}

const forbiddenAuditKey = /(?:authorization|cookie|database.?url|password|secret|session|token)/i;

export function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 500);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !forbiddenAuditKey.test(key))
      .map(([key, child]) => [key, sanitizeAuditValue(child)]),
  );
}
