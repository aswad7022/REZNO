import { Prisma } from "@prisma/client";

import { commerceError } from "./errors";

export const COMMERCE_CURRENCY = "IQD" as const;
export const COMMERCE_MONEY_PRECISION = 18;
export const COMMERCE_MONEY_SCALE = 3;
export const COMMERCE_MONEY_INTEGER_DIGITS =
  COMMERCE_MONEY_PRECISION - COMMERCE_MONEY_SCALE;
export const COMMERCE_MAX_WHOLE_IQD = "999999999999999";
export const COMMERCE_MAX_DECIMAL_AMOUNT = `${COMMERCE_MAX_WHOLE_IQD}.999`;

export type DecimalInput = Prisma.Decimal.Value;

export interface CommerceLineInput {
  compareAtPrice?: DecimalInput | null;
  quantity: number;
  unitPrice: DecimalInput;
}

export interface CommerceLineTotal {
  compareAtPrice: string | null;
  lineDiscount: string;
  lineSubtotal: string;
  lineTotal: string;
  quantity: number;
  unitPrice: string;
}

export interface CommerceOrderTotals {
  currency: typeof COMMERCE_CURRENCY;
  deliveryFee: string;
  discountTotal: string;
  grandTotal: string;
  lines: CommerceLineTotal[];
  subtotal: string;
  taxTotal: "0.000";
}

function decimal(value: DecimalInput, field: string) {
  let result: Prisma.Decimal;
  try {
    result = new Prisma.Decimal(value);
  } catch {
    return commerceError("VALIDATION_ERROR", `${field} is not a decimal.`);
  }

  if (!result.isFinite() || result.decimalPlaces() > COMMERCE_MONEY_SCALE) {
    return commerceError(
      "VALIDATION_ERROR",
      `${field} must have at most ${COMMERCE_MONEY_SCALE} decimal places.`,
    );
  }

  return result;
}

export function isCommerceAmountWithinPersistenceCapacity(value: DecimalInput) {
  try {
    const result = new Prisma.Decimal(value);
    return result.isFinite() &&
      result.decimalPlaces() <= COMMERCE_MONEY_SCALE &&
      result.abs().lessThanOrEqualTo(COMMERCE_MAX_DECIMAL_AMOUNT);
  } catch {
    return false;
  }
}

export function assertCommercePersistenceAmount(value: DecimalInput, field: string) {
  const result = decimal(value, field);
  if (!isCommerceAmountWithinPersistenceCapacity(result)) {
    return commerceError(
      "VALIDATION_ERROR",
      `${field} exceeds Decimal(${COMMERCE_MONEY_PRECISION},${COMMERCE_MONEY_SCALE}) capacity.`,
    );
  }
  return result;
}

export function assertIqdAmount(
  value: DecimalInput,
  field: string,
  options: { allowZero?: boolean } = {},
) {
  const result = assertCommercePersistenceAmount(value, field);
  const validSign = options.allowZero ? result.greaterThanOrEqualTo(0) : result.greaterThan(0);

  if (!validSign) {
    return commerceError(
      "VALIDATION_ERROR",
      `${field} must be ${options.allowZero ? "nonnegative" : "positive"}.`,
    );
  }

  if (!result.isInteger()) {
    return commerceError(
      "VALIDATION_ERROR",
      `${field} must not contain a fractional IQD amount.`,
    );
  }

  return result;
}

export function decimalString(value: Prisma.Decimal): string {
  return value.toFixed(COMMERCE_MONEY_SCALE);
}

export function calculateCommerceTotals(
  lines: readonly CommerceLineInput[],
  deliveryFeeInput: DecimalInput,
): CommerceOrderTotals {
  if (lines.length === 0) {
    return commerceError("VALIDATION_ERROR", "At least one line is required.");
  }

  const deliveryFee = assertIqdAmount(deliveryFeeInput, "deliveryFee", {
    allowZero: true,
  });
  let subtotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);

  const calculatedLines = lines.map((line, index) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      return commerceError(
        "VALIDATION_ERROR",
        `lines[${index}].quantity must be an integer between 1 and 99.`,
      );
    }

    const unitPrice = assertIqdAmount(line.unitPrice, `lines[${index}].unitPrice`);
    const compareAtPrice =
      line.compareAtPrice === null || line.compareAtPrice === undefined
        ? null
        : assertIqdAmount(line.compareAtPrice, `lines[${index}].compareAtPrice`);

    if (compareAtPrice && !compareAtPrice.greaterThan(unitPrice)) {
      return commerceError(
        "VALIDATION_ERROR",
        `lines[${index}].compareAtPrice must be greater than unitPrice.`,
      );
    }

    const lineSubtotal = assertCommercePersistenceAmount(
      (compareAtPrice ?? unitPrice).times(line.quantity),
      `lines[${index}].lineSubtotal`,
    );
    const lineTotal = assertCommercePersistenceAmount(
      unitPrice.times(line.quantity),
      `lines[${index}].lineTotal`,
    );
    const lineDiscount = assertCommercePersistenceAmount(
      lineSubtotal.minus(lineTotal),
      `lines[${index}].lineDiscount`,
    );
    subtotal = assertCommercePersistenceAmount(
      subtotal.plus(lineSubtotal),
      "subtotal",
    );
    discountTotal = assertCommercePersistenceAmount(
      discountTotal.plus(lineDiscount),
      "discountTotal",
    );

    return {
      compareAtPrice: compareAtPrice ? decimalString(compareAtPrice) : null,
      lineDiscount: decimalString(lineDiscount),
      lineSubtotal: decimalString(lineSubtotal),
      lineTotal: decimalString(lineTotal),
      quantity: line.quantity,
      unitPrice: decimalString(unitPrice),
    };
  });

  const grandTotal = assertCommercePersistenceAmount(
    subtotal.minus(discountTotal).plus(deliveryFee),
    "grandTotal",
  );

  return {
    currency: COMMERCE_CURRENCY,
    deliveryFee: decimalString(deliveryFee),
    discountTotal: decimalString(discountTotal),
    grandTotal: decimalString(grandTotal),
    lines: calculatedLines,
    subtotal: decimalString(subtotal),
    taxTotal: "0.000",
  };
}
