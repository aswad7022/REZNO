import { Prisma } from "@prisma/client";

import { paymentDecimal, paymentMoneyString, type PaymentDecimalInput } from "./money";

export interface CommissionSnapshot {
  amount: string;
  basisPoints: number;
  merchantNet: string;
  policyId: string;
}

export interface CommissionPolicy {
  readonly id: string;
  calculate(capturedAmount: PaymentDecimalInput): CommissionSnapshot;
}

export class ZeroCommissionPolicy implements CommissionPolicy {
  readonly id = "zero-v1";

  calculate(capturedAmountInput: PaymentDecimalInput): CommissionSnapshot {
    const capturedAmount = paymentDecimal(capturedAmountInput, "capturedAmount");
    return {
      amount: "0.000",
      basisPoints: 0,
      merchantNet: paymentMoneyString(capturedAmount),
      policyId: this.id,
    };
  }
}

export function calculateBasisPointCommission(
  capturedAmountInput: PaymentDecimalInput,
  basisPoints: number,
  policyId: string,
): CommissionSnapshot {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000 || !policyId) {
    throw new Error("Invalid commission policy.");
  }
  const capturedAmount = paymentDecimal(capturedAmountInput, "capturedAmount");
  const exact = capturedAmount.times(new Prisma.Decimal(basisPoints)).dividedBy(10_000);
  if (!exact.isInteger()) throw new Error("Commission policy produces a fractional IQD amount.");
  const amount = paymentDecimal(exact, "commissionAmount", { allowZero: true });
  return {
    amount: paymentMoneyString(amount),
    basisPoints,
    merchantNet: paymentMoneyString(capturedAmount.minus(amount)),
    policyId,
  };
}

export const paymentCommissionPolicy: CommissionPolicy = new ZeroCommissionPolicy();
