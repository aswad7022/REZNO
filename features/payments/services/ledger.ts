import { randomUUID } from "node:crypto";
import type {
  FinancialAccountFamily,
  FinancialPostingSide,
  PaymentIntent,
  Prisma,
} from "@prisma/client";

import { paymentError } from "@/features/payments/domain/errors";
import { paymentDecimal } from "@/features/payments/domain/money";

type Transaction = Prisma.TransactionClient;

async function account(
  transaction: Transaction,
  family: FinancialAccountFamily,
  currency: string,
  organizationId: string | null,
) {
  const existing = await transaction.financialAccount.findFirst({
    where: { currency, family, organizationId },
  });
  if (existing) return existing;
  return transaction.financialAccount.create({
    data: { currency, family, id: randomUUID(), organizationId },
  });
}

export async function postCaptureJournal(
  transaction: Transaction,
  input: {
    captureAmount: Prisma.Decimal;
    commissionAmount: Prisma.Decimal;
    currency: string;
    merchantAmount: Prisma.Decimal;
    organizationId: string;
    paymentIntentId: string;
    sourceId: string;
    postedAt: Date;
  },
) {
  const existing = await transaction.financialJournal.findUnique({
    where: { sourceType_sourceId: { sourceId: input.sourceId, sourceType: "CAPTURE" } },
    include: { postings: true },
  });
  if (existing) return existing;
  if (!input.captureAmount.equals(input.merchantAmount.plus(input.commissionAmount))) {
    paymentError("FINANCIAL_LEDGER_IMBALANCE", "Capture allocation is not balanced.");
  }
  const [providerClearing, merchantPayable, platformRevenue] = await Promise.all([
    account(transaction, "PROVIDER_CLEARING", input.currency, null),
    account(transaction, "MERCHANT_PAYABLE", input.currency, input.organizationId),
    input.commissionAmount.isZero()
      ? Promise.resolve(null)
      : account(transaction, "PLATFORM_REVENUE", input.currency, null),
  ]);
  const postings: Array<{ id: string; accountId: string; amount: Prisma.Decimal; side: FinancialPostingSide }> = [
    { accountId: providerClearing.id, amount: input.captureAmount, id: randomUUID(), side: "DEBIT" },
    { accountId: merchantPayable.id, amount: input.merchantAmount, id: randomUUID(), side: "CREDIT" },
  ];
  if (platformRevenue) {
    postings.push({ accountId: platformRevenue.id, amount: input.commissionAmount, id: randomUUID(), side: "CREDIT" });
  }
  const journal = await transaction.financialJournal.create({
    data: {
      currency: input.currency,
      id: randomUUID(),
      idempotencyKey: "capture:" + input.sourceId,
      paymentIntentId: input.paymentIntentId,
      sourceId: input.sourceId,
      sourceType: "CAPTURE",
      postings: { create: postings },
    },
  });
  return transaction.financialJournal.update({
    where: { id: journal.id },
    data: { postedAt: input.postedAt, status: "POSTED" },
    include: { postings: true },
  });
}

export async function postRefundJournal(
  transaction: Transaction,
  input: {
    amount: Prisma.Decimal;
    currency: string;
    organizationId: string;
    paymentIntentId: string;
    paymentRefundId: string;
    postedAt: Date;
  },
) {
  const existing = await transaction.financialJournal.findUnique({
    where: { sourceType_sourceId: { sourceId: input.paymentRefundId, sourceType: "REFUND" } },
    include: { postings: true },
  });
  if (existing) return existing;
  const [merchantPayable, refundClearing] = await Promise.all([
    account(transaction, "MERCHANT_PAYABLE", input.currency, input.organizationId),
    account(transaction, "CUSTOMER_REFUND_CLEARING", input.currency, null),
  ]);
  const journal = await transaction.financialJournal.create({
    data: {
      currency: input.currency,
      id: randomUUID(),
      idempotencyKey: "refund:" + input.paymentRefundId,
      paymentIntentId: input.paymentIntentId,
      paymentRefundId: input.paymentRefundId,
      sourceId: input.paymentRefundId,
      sourceType: "REFUND",
      postings: {
        create: [
          { accountId: merchantPayable.id, amount: input.amount, id: randomUUID(), side: "DEBIT" },
          { accountId: refundClearing.id, amount: input.amount, id: randomUUID(), side: "CREDIT" },
        ],
      },
    },
  });
  return transaction.financialJournal.update({
    where: { id: journal.id },
    data: { postedAt: input.postedAt, status: "POSTED" },
    include: { postings: true },
  });
}

export async function reverseFinancialJournal(
  transaction: Transaction,
  journalId: string,
  idempotencyKey: string,
  reversedAt: Date,
) {
  const original = await transaction.financialJournal.findUnique({
    where: { id: journalId },
    include: { postings: true },
  });
  if (!original || original.status !== "POSTED") {
    paymentError("PAYMENT_STATE_CONFLICT", "Only a posted journal can be reversed.");
  }
  const existing = await transaction.financialJournal.findUnique({
    where: { reversalOfJournalId: original.id },
    include: { postings: true },
  });
  if (existing) return existing;
  const reversal = await transaction.financialJournal.create({
    data: {
      currency: original.currency,
      id: randomUUID(),
      idempotencyKey,
      paymentIntentId: original.paymentIntentId,
      paymentRefundId: original.paymentRefundId,
      reversalOfJournalId: original.id,
      sourceId: original.id,
      sourceType: "REVERSAL",
      postings: {
        create: original.postings.map((posting) => ({
          accountId: posting.accountId,
          amount: posting.amount,
          id: randomUUID(),
          side: posting.side === "DEBIT" ? "CREDIT" : "DEBIT",
        })),
      },
    },
  });
  const posted = await transaction.financialJournal.update({
    where: { id: reversal.id },
    data: { postedAt: reversedAt, status: "POSTED" },
    include: { postings: true },
  });
  await transaction.financialJournal.update({
    where: { id: original.id },
    data: { status: "REVERSED" },
  });
  return posted;
}

export function assertJournalBalanced(input: {
  postings: Array<{ amount: Prisma.Decimal; side: FinancialPostingSide }>;
}): void {
  const totals = input.postings.reduce(
    (value, posting) => {
      value[posting.side] = value[posting.side].plus(paymentDecimal(posting.amount, "posting.amount"));
      return value;
    },
    { CREDIT: paymentDecimal("0", "credit", { allowZero: true }), DEBIT: paymentDecimal("0", "debit", { allowZero: true }) },
  );
  if (input.postings.length < 2 || totals.DEBIT.isZero() || !totals.DEBIT.equals(totals.CREDIT)) {
    paymentError("FINANCIAL_LEDGER_IMBALANCE", "Financial journal is not balanced.");
  }
}

export function isLateCaptureTarget(intent: PaymentIntent & {
  booking?: { status: string } | null;
  order?: { status: string } | null;
}): boolean {
  return intent.order
    ? ["CANCELLED", "EXPIRED", "REJECTED"].includes(intent.order.status)
    : intent.booking
      ? ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(intent.booking.status)
      : true;
}
