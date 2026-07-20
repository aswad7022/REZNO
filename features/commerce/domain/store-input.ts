import { z } from "zod";

import {
  COMMERCE_MONEY_INTEGER_DIGITS,
} from "@/features/commerce/domain/money";

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).default("").transform((value) => value || null);

const nullablePhone = z.string().trim().max(30).default("").transform((value, context) => {
  if (!value) return null;
  const normalized = value.replace(/[\s()-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) {
    context.addIssue({ code: "custom", message: "Support phone is invalid." });
    return z.NEVER;
  }
  return normalized;
});

const iqdAmount = z.string().trim().default("0").superRefine((value, context) => {
  if (!/^\d+$/.test(value)) {
    context.addIssue({ code: "custom", message: "IQD amount must be a non-negative whole number." });
    return;
  }
  const canonical = value.replace(/^0+(?=\d)/, "");
  if (canonical.length > COMMERCE_MONEY_INTEGER_DIGITS) {
    context.addIssue({ code: "custom", message: "IQD amount exceeds storage capacity." });
  }
}).transform((value) => value.replace(/^0+(?=\d)/, ""));
const estimate = z.number().int().min(1).max(10_080).nullable().default(null);

export const storeProfileSchema = z.object({
  currency: z.literal("IQD").default("IQD"),
  deliveryArea: nullableText(160),
  deliveryCity: nullableText(160),
  deliveryEnabled: z.boolean(),
  deliveryEstimateMinutes: estimate,
  deliveryFee: iqdAmount,
  description: nullableText(4_000),
  minimumOrderValue: iqdAmount,
  name: z.string().trim().min(2).max(120),
  pickupAdditionalDetails: nullableText(500),
  pickupArea: nullableText(160),
  pickupCity: nullableText(160),
  pickupEnabled: z.boolean(),
  pickupInstructions: nullableText(1_000),
  pickupStreet: nullableText(240),
  preparationEstimateMinutes: estimate,
  slug: z.string().trim().toLowerCase().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  supportPhone: nullablePhone,
}).strict();

export const storeOperationEnvelopeSchema = z.object({
  contextOrganizationId: z.string().uuid(),
  expectedVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
}).strict();

export const createStoreSchema = storeProfileSchema.extend({
  contextOrganizationId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
}).strict();

export const updateStoreSchema = storeProfileSchema.extend(storeOperationEnvelopeSchema.shape).extend({
  storeId: z.string().uuid(),
}).strict();

export const storeLifecycleSchema = storeOperationEnvelopeSchema.extend({
  storeId: z.string().uuid(),
}).strict();

export const archiveStoreSchema = storeLifecycleSchema.extend({
  reason: z.string().trim().min(2).max(500),
}).strict();

export const adminStoreMutationSchema = z.object({
  expectedVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(2).max(1_000).nullable(),
  storeId: z.string().uuid(),
}).strict();

export type StoreProfileInput = z.infer<typeof storeProfileSchema>;
export type CreateStoreInput = z.input<typeof createStoreSchema>;
export type UpdateStoreInput = z.input<typeof updateStoreSchema>;
