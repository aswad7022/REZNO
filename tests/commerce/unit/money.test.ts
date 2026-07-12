import assert from "node:assert/strict";
import test from "node:test";

import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import {
  assertIqdAmount,
  calculateCommerceTotals,
} from "../../../features/commerce/domain/money";

test("commerce totals use Decimal strings and include product reductions", () => {
  const result = calculateCommerceTotals(
    [
      { compareAtPrice: "12000", quantity: 2, unitPrice: "10000" },
      { quantity: 1, unitPrice: "5000" },
    ],
    "1500",
  );

  assert.deepEqual(result, {
    currency: "IQD",
    deliveryFee: "1500.000",
    discountTotal: "4000.000",
    grandTotal: "26500.000",
    lines: [
      {
        compareAtPrice: "12000.000",
        lineDiscount: "4000.000",
        lineSubtotal: "24000.000",
        lineTotal: "20000.000",
        quantity: 2,
        unitPrice: "10000.000",
      },
      {
        compareAtPrice: null,
        lineDiscount: "0.000",
        lineSubtotal: "5000.000",
        lineTotal: "5000.000",
        quantity: 1,
        unitPrice: "5000.000",
      },
    ],
    subtotal: "29000.000",
    taxTotal: "0.000",
  });
});

test("IQD fractional amounts are rejected", () => {
  assert.throws(
    () => assertIqdAmount("100.500", "price"),
    (error: unknown) =>
      error instanceof CommerceDomainError && error.code === "VALIDATION_ERROR",
  );
});

test("compare-at price must exceed the selling price", () => {
  assert.throws(
    () =>
      calculateCommerceTotals(
        [{ compareAtPrice: "1000", quantity: 1, unitPrice: "1000" }],
        "0",
      ),
    (error: unknown) =>
      error instanceof CommerceDomainError && error.code === "VALIDATION_ERROR",
  );
});
