import { z } from "zod";

import { normalizeCommerceText } from "@/features/commerce/domain/catalog";
import { COMMERCE_MONEY_INTEGER_DIGITS } from "@/features/commerce/domain/money";
import { isSafePublicImageUrl } from "@/lib/security/public-image-url";

const uuid = z.string().uuid();
const expectedVersion = z.string().datetime({ offset: true });
const idempotencyKey = z.string().uuid();
const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).default("").transform((value) => value || null);

export const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const wholeIqdSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (!/^\d+$/.test(value)) {
      context.addIssue({ code: "custom", message: "IQD value must be a positive whole number." });
      return;
    }
    const canonical = value.replace(/^0+(?=\d)/, "");
    if (canonical === "0") {
      context.addIssue({ code: "custom", message: "IQD value must be positive." });
    }
    if (canonical.length > COMMERCE_MONEY_INTEGER_DIGITS) {
      context.addIssue({ code: "custom", message: "IQD value exceeds storage capacity." });
    }
  })
  .transform((value) => value.replace(/^0+(?=\d)/, ""));

const optionValuesSchema = z.record(z.string(), z.string()).superRefine((value, context) => {
  try {
    canonicalizeVariantOptions(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Variant options are invalid.",
    });
  }
});

const variantProfileShape = {
  compareAtPrice: z.union([wholeIqdSchema, z.literal("")]).default("").transform((value) => value || null),
  optionValues: optionValuesSchema.default({}),
  price: wholeIqdSchema,
  sku: z.string().trim().min(1).max(80).transform(canonicalSku).pipe(z.string().min(1).max(80)),
  title: z.string().trim().min(1).max(160),
};

function assertCompareAtPrice(
  value: { compareAtPrice: string | null; price: string },
  context: z.RefinementCtx,
) {
  if (value.compareAtPrice !== null && BigInt(value.compareAtPrice) <= BigInt(value.price)) {
    context.addIssue({
      code: "custom",
      message: "Compare-at price must be greater than price.",
      path: ["compareAtPrice"],
    });
  }
}

export const variantProfileSchema = z.object(variantProfileShape).strict().superRefine(assertCompareAtPrice);

export const productProfileSchema = z.object({
  categoryId: uuid,
  description: nullableText(8_000),
  name: z.string().trim().min(2).max(160),
  slug: productSlugSchema,
}).strict();

const aggregateEnvelope = z.object({
  contextOrganizationId: uuid,
  expectedVersion,
  idempotencyKey,
  productId: uuid,
}).strict();

export const createProductAggregateSchema = productProfileSchema.extend({
  contextOrganizationId: uuid,
  defaultVariant: variantProfileSchema,
  idempotencyKey,
}).strict();

export const updateProductAggregateSchema = productProfileSchema.extend(aggregateEnvelope.shape).strict();

export const productLifecycleSchema = aggregateEnvelope;

export const createVariantSchema = z.object({
  ...variantProfileShape,
  ...aggregateEnvelope.shape,
}).strict().superRefine(assertCompareAtPrice);

export const updateVariantSchema = z.object({
  ...variantProfileShape,
  ...aggregateEnvelope.shape,
  variantId: uuid,
}).strict().superRefine(assertCompareAtPrice);

export const setDefaultVariantSchema = aggregateEnvelope.extend({ variantId: uuid }).strict();

export const archiveVariantSchema = aggregateEnvelope.extend({
  replacementVariantId: uuid.nullable().default(null),
  variantId: uuid,
}).strict();

export const restoreVariantSchema = aggregateEnvelope.extend({
  makeDefault: z.boolean().default(false),
  variantId: uuid,
}).strict();

const safeImageUrl = z.string().trim().max(2_048).refine(
  isSafePublicImageUrl,
  "Image URL must be a safe public HTTPS URL.",
).transform((value) => new URL(value).toString());

export const addProductMediaSchema = aggregateEnvelope.extend({
  altText: nullableText(300),
  url: safeImageUrl,
  variantId: uuid.nullable().default(null),
}).strict();

export const updateProductMediaSchema = aggregateEnvelope.extend({
  altText: nullableText(300),
  mediaId: uuid,
}).strict();

export const reorderProductMediaSchema = aggregateEnvelope.extend({
  mediaIds: z.array(uuid).max(12).refine((ids) => new Set(ids).size === ids.length),
}).strict();

export const removeProductMediaSchema = aggregateEnvelope.extend({ mediaId: uuid }).strict();

export const updateInventoryThresholdSchema = z.object({
  contextOrganizationId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_647),
  idempotencyKey,
  inventoryItemId: uuid,
  lowStockThreshold: z.number().int().min(0).max(2_147_483_647).nullable(),
}).strict();

export function canonicalSku(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, "-").toUpperCase();
}

export function canonicalizeVariantOptions(value: Readonly<Record<string, string>>) {
  const seen = new Set<string>();
  const entries = Object.entries(value).map(([rawKey, rawValue]) => {
    const key = rawKey.normalize("NFKC").trim().replace(/\s+/g, " ");
    const item = rawValue.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!key || !item || key.length > 60 || item.length > 120) {
      throw new Error("Variant option names and values must be bounded non-empty text.");
    }
    const normalizedKey = normalizeCommerceText(key);
    if (seen.has(normalizedKey)) throw new Error("Variant option names must be unique after normalization.");
    seen.add(normalizedKey);
    return { item, key, normalizedKey, normalizedValue: normalizeCommerceText(item) };
  });
  if (entries.length > 3) throw new Error("A Variant supports at most three option dimensions.");
  entries.sort((left, right) =>
    left.normalizedKey < right.normalizedKey
      ? -1
      : left.normalizedKey > right.normalizedKey
        ? 1
        : 0,
  );
  return {
    optionKey: entries.length
      ? entries.map((entry) => `${entry.normalizedKey}=${entry.normalizedValue}`).join("|")
      : "default",
    optionValues: Object.fromEntries(entries.map((entry) => [entry.key, entry.item])),
  };
}

export function productSearchText(input: { description: string | null; name: string }) {
  return normalizeCommerceText(`${input.name} ${input.description ?? ""}`);
}

export type CreateProductAggregateInput = z.input<typeof createProductAggregateSchema>;
export type UpdateProductAggregateInput = z.input<typeof updateProductAggregateSchema>;
export type CreateVariantAggregateInput = z.input<typeof createVariantSchema>;
export type UpdateVariantAggregateInput = z.input<typeof updateVariantSchema>;
