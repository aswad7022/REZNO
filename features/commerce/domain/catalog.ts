import { commerceError } from "./errors";
import { isStorePublic, type StoreLifecycleStatus } from "./store-lifecycle";

export type ProductLifecycleStatus = "DRAFT" | "PUBLISHED" | "SUSPENDED" | "ARCHIVED";

const arabicDiacriticsPattern = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export function normalizeCommerceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(arabicDiacriticsPattern, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function isProductPublic(input: {
  productStatus: ProductLifecycleStatus;
  publishedAt: Date | null;
  storeStatus: StoreLifecycleStatus;
  variantAvailable: boolean;
}): boolean {
  return (
    isStorePublic(input.storeStatus) &&
    input.productStatus === "PUBLISHED" &&
    input.publishedAt !== null &&
    input.variantAvailable
  );
}

export function assertProductPublishable(input: {
  activeVariantCount: number;
  storeStatus: StoreLifecycleStatus;
}) {
  if (!isStorePublic(input.storeStatus)) {
    commerceError("STORE_UNAVAILABLE", "Only an ACTIVE Store can publish Products.");
  }
  if (!Number.isInteger(input.activeVariantCount) || input.activeVariantCount < 1) {
    commerceError("PRODUCT_UNAVAILABLE", "A Product requires an available Variant.");
  }
}
