import "server-only";

import { Prisma, type PaymentIntentStatus } from "@prisma/client";

import {
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import { paymentMoneyString } from "@/features/payments/domain/money";
import { targetPaymentStatus } from "@/features/payments/domain/state-machine";
import { paymentProvider } from "@/features/payments/providers/registry";
import type { ProviderResult } from "@/features/payments/providers/provider";
import { runPaymentSerializable } from "@/features/payments/services/transaction";
import type { PaymentExecutionGuard } from "@/features/payments/services/provider-events";

export type ReconciliationClassification =
  | "MATCHED"
  | "PROVIDER_AHEAD"
  | "DATABASE_AHEAD"
  | "LEDGER_MISMATCH"
  | "TARGET_STATE_MISMATCH"
  | "MISSING_PROVIDER_RECORD"
  | "NOT_CONFIGURED";

export type PaymentReconciliationPage = {
  kind: "RECONCILIATION_PAGE";
  checked: number;
  items: Array<{
    kind: "RECONCILIATION_RESULT";
    paymentIntentId: string;
    classification: ReconciliationClassification;
    paymentStatus: string;
    providerStatus: string;
    amount: string;
    capturedAmount: string;
    refundedAmount: string;
    ledgerCapturedAmount: string;
    ledgerRefundedAmount: string;
    targetPaymentStatus: string | null;
    expectedTargetPaymentStatus: string;
    settlementState: "HAS_FINALIZED_INCLUSION" | "UNSETTLED";
  }>;
  summary: Record<ReconciliationClassification, number>;
};

type Candidate = {
  booking: { paymentStatus: string } | null;
  capturedAmount: Prisma.Decimal;
  currency: string;
  id: string;
  order: { paymentStatus: string } | null;
  providerReference: string | null;
  refundedAmount: Prisma.Decimal;
  amount: Prisma.Decimal;
  status: PaymentIntentStatus;
};

type LedgerTotals = {
  captureTotal: Prisma.Decimal;
  intentId: string;
  refundTotal: Prisma.Decimal;
  settledJournalCount: bigint;
};

export async function runPaymentReconciliation(
  context: CommerceAdminContext,
  input: {
    idempotencyKey: string;
    limit?: number;
    organizationId?: string;
    paymentIntentId?: string;
  },
  executionGuard?: PaymentExecutionGuard,
) {
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) paymentError("VALIDATION_ERROR", "Reconciliation limit is invalid.");
  const requestHash = paymentRequestHash({
    actor: "admin:" + context.userId,
    limit,
    organizationId: input.organizationId ?? null,
    paymentIntentId: input.paymentIntentId ?? null,
  });
  const prepared = await runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_RECONCILE");
    await executionGuard?.(transaction);
    if (input.organizationId) {
      const organization = await transaction.organization.findFirst({ where: { deletedAt: null, id: input.organizationId }, select: { id: true } });
      if (!organization) paymentError("NOT_FOUND", "Organization was not found.");
    }
    const replay = await transaction.adminAuditLog.findUnique({
      where: { adminUserId_idempotencyKey: { adminUserId: context.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (replay) {
      if (replay.action !== "payments.reconciliation.run" || replay.requestHash !== requestHash) {
        paymentError("IDEMPOTENCY_CONFLICT", "Reconciliation key was reused with changed input.");
      }
      if (replay.result) return { replay: replay.result, candidates: [] as Candidate[] };
    } else {
      await transaction.adminAuditLog.create({
        data: {
          action: "payments.reconciliation.run",
          adminUserId: context.userId,
          idempotencyKey: input.idempotencyKey,
          metadata: { limit, organizationId: input.organizationId ?? null, state: "PROCESSING" },
          requestHash,
          targetId: input.paymentIntentId ?? input.organizationId ?? null,
          targetType: input.paymentIntentId ? "PaymentIntent" : input.organizationId ? "Organization" : "PaymentBatch",
        },
      });
    }
    const candidates = await transaction.paymentIntent.findMany({
      where: {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.paymentIntentId ? { id: input.paymentIntentId } : {}),
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: {
        amount: true,
        booking: { select: { paymentStatus: true } },
        capturedAmount: true,
        currency: true,
        id: true,
        order: { select: { paymentStatus: true } },
        providerReference: true,
        refundedAmount: true,
        status: true,
      },
    });
    if (input.paymentIntentId && candidates.length === 0) paymentError("NOT_FOUND", "Payment was not found.");
    return { replay: null, candidates };
  });
  if (prepared.replay) return prepared.replay as unknown as PaymentReconciliationPage;

  const provider = paymentProvider();
  if (executionGuard) {
    await runPaymentSerializable((transaction) => executionGuard(transaction));
  }
  const providerResults = new Map<string, ProviderResult>();
  if (provider.kind !== "NOT_CONFIGURED") {
    for (const candidate of prepared.candidates) {
      if (candidate.providerReference) {
        try {
          providerResults.set(candidate.id, await provider.inspectPayment({
            paymentIntentId: candidate.id,
            providerReference: candidate.providerReference,
          }));
        } catch {
          providerResults.set(candidate.id, { outcome: "TRANSIENT_FAILURE", safeCode: "PROVIDER_FAILURE" });
        }
      }
    }
  }

  const result = await runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_RECONCILE");
    await executionGuard?.(transaction);
    const ledgerTotals = await loadLedgerTotals(transaction, prepared.candidates.map((candidate) => candidate.id));
    const ledgerByIntent = new Map(ledgerTotals.map((total) => [total.intentId, total]));
    const items = prepared.candidates.map((candidate) => {
      const ledger = ledgerByIntent.get(candidate.id) ?? {
        captureTotal: new Prisma.Decimal(0),
        refundTotal: new Prisma.Decimal(0),
        settledJournalCount: BigInt(0),
      };
      const expectedTargetStatus = targetPaymentStatus(candidate);
      const actualTargetStatus = candidate.order?.paymentStatus ?? candidate.booking?.paymentStatus ?? null;
      const providerResult = providerResults.get(candidate.id);
      const classification = classify(candidate, ledger, provider.kind, providerResult, expectedTargetStatus, actualTargetStatus);
      return {
        kind: "RECONCILIATION_RESULT" as const,
        paymentIntentId: candidate.id,
        classification,
        paymentStatus: candidate.status,
        providerStatus: provider.kind === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : providerResult?.outcome ?? "NOT_FOUND",
        amount: paymentMoneyString(candidate.amount),
        capturedAmount: paymentMoneyString(candidate.capturedAmount),
        refundedAmount: paymentMoneyString(candidate.refundedAmount),
        ledgerCapturedAmount: paymentMoneyString(ledger.captureTotal),
        ledgerRefundedAmount: paymentMoneyString(ledger.refundTotal),
        targetPaymentStatus: actualTargetStatus,
        expectedTargetPaymentStatus: expectedTargetStatus,
        settlementState: ledger.settledJournalCount > BigInt(0) ? "HAS_FINALIZED_INCLUSION" as const : "UNSETTLED" as const,
      };
    });
    const response: PaymentReconciliationPage = {
      kind: "RECONCILIATION_PAGE" as const,
      checked: items.length,
      items,
      summary: items.reduce<Record<ReconciliationClassification, number>>((counts, item) => {
        counts[item.classification] += 1;
        return counts;
      }, {
        DATABASE_AHEAD: 0,
        LEDGER_MISMATCH: 0,
        MATCHED: 0,
        MISSING_PROVIDER_RECORD: 0,
        NOT_CONFIGURED: 0,
        PROVIDER_AHEAD: 0,
        TARGET_STATE_MISMATCH: 0,
      }),
    };
    await executionGuard?.(transaction);
    await transaction.adminAuditLog.update({
      where: { adminUserId_idempotencyKey: { adminUserId: context.userId, idempotencyKey: input.idempotencyKey } },
      data: {
        metadata: { checked: response.checked, state: "COMPLETED", summary: response.summary },
        result: response,
        resultVersion: new Date(),
      },
    });
    return response;
  });
  return result;
}

function classify(
  candidate: Candidate,
  ledger: Pick<LedgerTotals, "captureTotal" | "refundTotal">,
  providerKind: string,
  providerResult: ProviderResult | undefined,
  expectedTargetStatus: string,
  actualTargetStatus: string | null,
): ReconciliationClassification {
  if (!ledger.captureTotal.equals(candidate.capturedAmount) || !ledger.refundTotal.equals(candidate.refundedAmount)) return "LEDGER_MISMATCH";
  if (actualTargetStatus !== expectedTargetStatus) return "TARGET_STATE_MISMATCH";
  if (providerKind === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  if (!candidate.providerReference || !providerResult || providerResult.outcome === "NOT_FOUND") return "MISSING_PROVIDER_RECORD";
  const providerCaptured = providerResult.outcome === "CAPTURED";
  const databaseCaptured = candidate.capturedAmount.isPositive();
  if (providerCaptured && !databaseCaptured) return "PROVIDER_AHEAD";
  if (!providerCaptured && databaseCaptured) return "DATABASE_AHEAD";
  return "MATCHED";
}

function loadLedgerTotals(transaction: Prisma.TransactionClient, intentIds: string[]) {
  if (intentIds.length === 0) return Promise.resolve([] as LedgerTotals[]);
  return transaction.$queryRaw<LedgerTotals[]>(Prisma.sql`
    SELECT
      journal."paymentIntentId" AS "intentId",
      COALESCE(SUM(posting."amount") FILTER (
        WHERE journal."sourceType" = 'CAPTURE' AND account."family" = 'PROVIDER_CLEARING' AND posting."side" = 'DEBIT'
      ), 0)::numeric(18,3) AS "captureTotal",
      COALESCE(SUM(posting."amount") FILTER (
        WHERE journal."sourceType" = 'REFUND' AND account."family" = 'MERCHANT_PAYABLE' AND posting."side" = 'DEBIT'
      ), 0)::numeric(18,3) AS "refundTotal",
      COUNT(DISTINCT finalized."journalId")::bigint AS "settledJournalCount"
    FROM "FinancialJournal" journal
    JOIN "FinancialPosting" posting ON posting."journalId" = journal."id"
    JOIN "FinancialAccount" account ON account."id" = posting."accountId"
    LEFT JOIN "SettlementLine" finalized ON finalized."journalId" = journal."id" AND EXISTS (
      SELECT 1 FROM "SettlementBatch" batch WHERE batch."id" = finalized."settlementBatchId" AND batch."status" = 'FINALIZED'
    )
    WHERE journal."paymentIntentId" IN (${Prisma.join(intentIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND journal."status" IN ('POSTED', 'REVERSED')
    GROUP BY journal."paymentIntentId"
  `);
}
