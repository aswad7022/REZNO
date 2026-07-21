import { Prisma } from "@prisma/client";

import { paymentError } from "./errors";

export const PAYMENT_CURRENCY = "IQD" as const;
export const PAYMENT_MONEY_PRECISION = 18;
export const PAYMENT_MONEY_SCALE = 3;

export const paymentCurrencyRegistry = {
  IQD: {
    code: PAYMENT_CURRENCY,
    displayExponent: 0,
    maximumAmount: "999999999999999.000",
    minimumAmount: "1.000",
    persistenceScale: PAYMENT_MONEY_SCALE,
    roundingMode: "EXACT_WHOLE_REJECT_FRACTION",
  },
} as const;

export type PaymentCurrency = keyof typeof paymentCurrencyRegistry;
export type PaymentDecimalInput = Prisma.Decimal.Value;

export function parsePaymentCurrency(value: string): PaymentCurrency {
  if (value !== PAYMENT_CURRENCY) {
    paymentError("PAYMENT_CURRENCY_MISMATCH", "Payment currency is unsupported.");
  }
  return value;
}

export function paymentDecimal(
  value: PaymentDecimalInput,
  field: string,
  options: { allowZero?: boolean } = {},
): Prisma.Decimal {
  if (typeof value === "number") {
    paymentError("VALIDATION_ERROR", field + " must not use JavaScript floating-point money.");
  }
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    paymentError("VALIDATION_ERROR", field + " is invalid.");
  }
  if (
    !amount.isFinite() ||
    amount.decimalPlaces() > PAYMENT_MONEY_SCALE ||
    !amount.isInteger() ||
    amount.greaterThan(paymentCurrencyRegistry.IQD.maximumAmount) ||
    (options.allowZero ? amount.isNegative() : amount.lessThan(paymentCurrencyRegistry.IQD.minimumAmount))
  ) {
    paymentError("VALIDATION_ERROR", field + " is outside the supported IQD range.");
  }
  return amount;
}

export function paymentMoneyString(value: PaymentDecimalInput): string {
  return paymentDecimal(value, "amount", { allowZero: true }).toFixed(PAYMENT_MONEY_SCALE);
}

export function paymentSignedMoneyString(value: PaymentDecimalInput): string {
  if (typeof value === "number") {
    paymentError("VALIDATION_ERROR", "amount must not use JavaScript floating-point money.");
  }
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    paymentError("VALIDATION_ERROR", "amount is invalid.");
  }
  if (
    !amount.isFinite() ||
    amount.decimalPlaces() > PAYMENT_MONEY_SCALE ||
    !amount.isInteger() ||
    amount.absoluteValue().greaterThan(paymentCurrencyRegistry.IQD.maximumAmount)
  ) {
    paymentError("VALIDATION_ERROR", "amount is outside the supported IQD range.");
  }
  return amount.toFixed(PAYMENT_MONEY_SCALE);
}

export function assertSamePaymentMoney(
  expected: PaymentDecimalInput,
  actual: PaymentDecimalInput,
): void {
  if (!paymentDecimal(expected, "expected").equals(paymentDecimal(actual, "actual"))) {
    paymentError("PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match the authoritative target.");
  }
}
