import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type SettlementBatchStatus } from "@prisma/client";

import {
  assertCommerceAdminCurrent,
  assertMerchantCommerceContextCurrent,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import {
  decodePaymentCursor,
  encodePaymentCursor,
  paymentCursorBinding,
} from "@/features/payments/domain/cursor";
import { settlementBatchDto, settlementDtoInclude } from "@/features/payments/domain/dto";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentRequestHash } from "@/features/payments/domain/idempotency";
import { paymentDecimal, paymentMoneyString, paymentSignedMoneyString } from "@/features/payments/domain/money";
import { notifySettlementFinalized } from "@/features/payments/services/payment-notifications";
import { runPaymentSerializable } from "@/features/payments/services/transaction";
import { getExactPostgresTime } from "@/lib/db/postgres-timestamp";

const MAX_SETTLEMENT_JOURNALS = 500;
const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000;

type SettlementLineCandidate = {
  captureGross: Prisma.Decimal;
  commission: Prisma.Decimal;
  journalId: string;
  merchantNet: Prisma.Decimal;
  refunds: Prisma.Decimal;
};

export async function previewSettlement(
  context: CommerceAdminContext,
  input: {
    currency: "IQD";
    idempotencyKey: string;
    organizationId: string;
    periodEnd: Date;
    periodStart: Date;
  },
) {
  assertSettlementPeriod(input.periodStart, input.periodEnd);
  return runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "SETTLEMENTS_MANAGE");
    const organization = await transaction.organization.findFirst({
      where: { deletedAt: null, id: input.organizationId },
      select: { id: true },
    });
    if (!organization) paymentError("NOT_FOUND", "Organization was not found.");
    const requestHash = paymentRequestHash({
      actor: "admin:" + context.userId,
      currency: input.currency,
      organizationId: input.organizationId,
      periodEnd: input.periodEnd.toISOString(),
      periodStart: input.periodStart.toISOString(),
    });
    const replay = await transaction.settlementBatch.findUnique({
      where: {
        organizationId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          organizationId: input.organizationId,
        },
      },
      include: settlementDtoInclude,
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        paymentError("IDEMPOTENCY_CONFLICT", "Settlement preview key was reused with changed input.");
      }
      return settlementBatchDto(replay);
    }
    const candidates = await settlementCandidates(transaction, input);
    if (candidates.length > MAX_SETTLEMENT_JOURNALS) {
      paymentError("VALIDATION_ERROR", "Settlement period has too many Journals; choose a shorter period.");
    }
    const totals = candidates.reduce(
      (total, line) => ({
        captureGross: total.captureGross.plus(line.captureGross),
        commission: total.commission.plus(line.commission),
        merchantNet: total.merchantNet.plus(line.merchantNet),
        refunds: total.refunds.plus(line.refunds),
      }),
      zeroSettlementAmounts(),
    );
    if (!totals.merchantNet.equals(totals.captureGross.minus(totals.refunds).minus(totals.commission))) {
      paymentError("FINANCIAL_LEDGER_IMBALANCE", "Settlement candidate calculation is not balanced.");
    }
    const batch = await transaction.settlementBatch.create({
      data: {
        ...totals,
        currency: input.currency,
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        organizationId: input.organizationId,
        periodEnd: input.periodEnd,
        periodStart: input.periodStart,
        requestHash,
        lines: {
          create: candidates.map((line) => ({
            ...line,
            currency: input.currency,
            id: randomUUID(),
            organizationId: input.organizationId,
            journalId: line.journalId,
          })),
        },
      },
      include: settlementDtoInclude,
    });
    await transaction.adminAuditLog.create({
      data: {
        action: "payments.settlement.preview",
        adminUserId: context.userId,
        metadata: {
          captureGross: paymentMoneyString(batch.captureGross),
          commission: paymentMoneyString(batch.commission),
          currency: batch.currency,
          journalCount: batch.lines.length,
          merchantNet: paymentSignedMoneyString(batch.merchantNet),
          organizationId: batch.organizationId,
          refunds: paymentMoneyString(batch.refunds),
        },
        requestHash,
        targetId: batch.id,
        targetType: "SettlementBatch",
      },
    });
    return settlementBatchDto(batch);
  });
}

export async function finalizeSettlement(
  context: CommerceAdminContext,
  batchId: string,
  input: { expectedVersion: number; idempotencyKey: string },
) {
  return runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "SETTLEMENTS_MANAGE");
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "SettlementBatch" WHERE "id" = ${batchId}::uuid FOR UPDATE`);
    const batch = await transaction.settlementBatch.findUnique({
      where: { id: batchId },
      include: settlementDtoInclude,
    });
    if (!batch) paymentError("NOT_FOUND", "Settlement was not found.");
    const requestHash = paymentRequestHash({
      actor: "admin:" + context.userId,
      batchId,
      expectedVersion: input.expectedVersion,
    });
    const replay = await transaction.adminAuditLog.findUnique({
      where: { adminUserId_idempotencyKey: { adminUserId: context.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (replay) {
      if (replay.action !== "payments.settlement.finalize" || replay.requestHash !== requestHash || replay.targetId !== batchId) {
        paymentError("IDEMPOTENCY_CONFLICT", "Settlement finalization key was reused with changed input.");
      }
      return settlementBatchDto(batch);
    }
    if (batch.version !== input.expectedVersion) paymentError("STALE_VERSION", "Settlement changed. Refresh and retry.");
    if (batch.status !== "DRAFT") paymentError("PAYMENT_STATE_CONFLICT", "Only a draft statement can be finalized.");
    if (batch.lines.length === 0) paymentError("PAYMENT_STATE_CONFLICT", "An empty statement cannot be finalized.");
    const conflicting = await transaction.settlementLine.findFirst({
      where: {
        journalId: { in: batch.lines.map((line) => line.journalId) },
        settlementBatchId: { not: batch.id },
        settlementBatch: { status: "FINALIZED" },
      },
      select: { id: true },
    });
    if (conflicting) paymentError("PAYMENT_STATE_CONFLICT", "A Journal is already included in a finalized statement.");
    const now = new Date();
    const finalized = await transaction.settlementBatch.update({
      where: { id: batch.id },
      data: {
        finalizedAt: now,
        finalizedByAdminId: context.userId,
        status: "FINALIZED",
        version: { increment: 1 },
      },
      include: settlementDtoInclude,
    });
    await notifySettlementFinalized(transaction, {
      batchId: finalized.id,
      currency: finalized.currency,
      merchantNet: finalized.merchantNet,
      organizationId: finalized.organizationId,
    });
    await transaction.adminAuditLog.create({
      data: {
        action: "payments.settlement.finalize",
        adminUserId: context.userId,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          currency: finalized.currency,
          journalCount: finalized.lines.length,
          meaning: "ledger_statement_not_bank_payout",
          merchantNet: paymentSignedMoneyString(finalized.merchantNet),
          organizationId: finalized.organizationId,
        },
        requestHash,
        result: { batchId: finalized.id, status: finalized.status, version: finalized.version },
        resultVersion: now,
        targetId: finalized.id,
        targetType: "SettlementBatch",
      },
    });
    return settlementBatchDto(finalized);
  });
}

export async function getBusinessSettlement(reference: MerchantActorReference, batchId: string) {
  const actor = await resolveMerchantCommerceContext(reference, "SETTLEMENT_VIEW");
  return runPaymentSerializable(async (transaction) => {
    await assertMerchantCommerceContextCurrent(transaction, actor, "SETTLEMENT_VIEW");
    const batch = await transaction.settlementBatch.findFirst({
      where: { id: batchId, organizationId: actor.organizationId, status: "FINALIZED" },
      include: settlementDtoInclude,
    });
    if (!batch) paymentError("NOT_FOUND", "Settlement was not found.");
    return settlementBatchDto(batch);
  });
}

export async function getAdminSettlement(context: CommerceAdminContext, batchId: string) {
  return runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "SETTLEMENTS_VIEW");
    const batch = await transaction.settlementBatch.findUnique({ where: { id: batchId }, include: settlementDtoInclude });
    if (!batch) paymentError("NOT_FOUND", "Settlement was not found.");
    return settlementBatchDto(batch);
  });
}

export async function listBusinessSettlements(
  reference: MerchantActorReference,
  input: { cursor?: string; limit?: number } = {},
) {
  const actor = await resolveMerchantCommerceContext(reference, "SETTLEMENT_VIEW");
  return listSettlements({
    actor,
    cursor: input.cursor,
    limit: input.limit,
    organizationId: actor.organizationId,
    scope: paymentCursorBinding({
      kind: "business",
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      personId: actor.personId,
      roleId: actor.roleId,
    }),
    status: "FINALIZED",
  });
}

export async function listAdminSettlements(
  context: CommerceAdminContext,
  input: { cursor?: string; limit?: number; organizationId?: string; status?: SettlementBatchStatus } = {},
) {
  return listSettlements({
    admin: context,
    cursor: input.cursor,
    limit: input.limit,
    organizationId: input.organizationId,
    scope: paymentCursorBinding({
      adminAccessId: context.adminAccessId,
      kind: "admin",
      personId: context.personId,
      source: context.source,
      userId: context.userId,
    }),
    status: input.status,
  });
}

async function listSettlements(input: {
  actor?: Awaited<ReturnType<typeof resolveMerchantCommerceContext>>;
  admin?: CommerceAdminContext;
  cursor?: string;
  limit?: number;
  organizationId?: string;
  scope: string;
  status?: SettlementBatchStatus;
}) {
  const pageSize = input.limit ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) paymentError("VALIDATION_ERROR", "limit is invalid.");
  return runPaymentSerializable(async (transaction) => {
    if (input.actor) await assertMerchantCommerceContextCurrent(transaction, input.actor, "SETTLEMENT_VIEW");
    else await assertCommerceAdminCurrent(transaction, input.admin!, "SETTLEMENTS_VIEW");
    const authoritativeNow = await getExactPostgresTime(transaction);
    const filter = paymentCursorBinding({ organizationId: input.organizationId ?? null, status: input.status ?? null });
    const decoded = input.cursor
      ? decodePaymentCursor("SETTLEMENT", input.cursor, { filter, pageSize, scope: input.scope }, authoritativeNow)
      : null;
    const snapshot = decoded?.snapshot ?? authoritativeNow;
    const boundary = decoded ? Prisma.sql`AND (batch."createdAt" < ${decoded.sortValue}::timestamptz OR (batch."createdAt" = ${decoded.sortValue}::timestamptz AND batch."id" < ${decoded.id}::uuid))` : Prisma.empty;
    const organization = input.organizationId ? Prisma.sql`AND batch."organizationId" = ${input.organizationId}::uuid` : Prisma.empty;
    const status = input.status ? Prisma.sql`AND batch."status" = ${input.status}::"SettlementBatchStatus"` : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string; sortValue: string }>>(Prisma.sql`
      SELECT batch."id", to_char(batch."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "sortValue"
      FROM "SettlementBatch" batch
      WHERE batch."createdAt" <= ${snapshot}::timestamptz ${organization} ${status} ${boundary}
      ORDER BY batch."createdAt" DESC, batch."id" DESC
      LIMIT ${pageSize + 1}
    `);
    const hasNextPage = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const records = pageRows.length
      ? await transaction.settlementBatch.findMany({ where: { id: { in: pageRows.map((row) => row.id) } }, include: settlementDtoInclude })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = pageRows.map((row) => byId.get(row.id)).filter(Boolean).map((batch) => settlementBatchDto(batch!));
    const last = hasNextPage ? pageRows.at(-1) : null;
    return {
      kind: "SETTLEMENT_PAGE" as const,
      items,
      nextCursor: last ? encodePaymentCursor("SETTLEMENT", {
        filter,
        id: last.id,
        pageSize,
        scope: input.scope,
        snapshot,
        sortValue: last.sortValue,
      }) : null,
      pageSize,
    };
  });
}

async function settlementCandidates(
  transaction: Prisma.TransactionClient,
  input: { currency: "IQD"; organizationId: string; periodEnd: Date; periodStart: Date },
) {
  return transaction.$queryRaw<SettlementLineCandidate[]>(Prisma.sql`
    SELECT
      journal."id" AS "journalId",
      COALESCE(SUM(posting."amount") FILTER (
        WHERE journal."sourceType" = 'CAPTURE' AND account."family" = 'PROVIDER_CLEARING' AND posting."side" = 'DEBIT'
      ), 0)::numeric(18,3) AS "captureGross",
      COALESCE(SUM(posting."amount") FILTER (
        WHERE journal."sourceType" = 'REFUND' AND account."family" = 'MERCHANT_PAYABLE' AND posting."side" = 'DEBIT'
      ), 0)::numeric(18,3) AS "refunds",
      COALESCE(SUM(posting."amount") FILTER (
        WHERE journal."sourceType" = 'CAPTURE' AND account."family" = 'PLATFORM_REVENUE' AND posting."side" = 'CREDIT'
      ), 0)::numeric(18,3) AS "commission",
      (
        COALESCE(SUM(posting."amount") FILTER (
          WHERE journal."sourceType" = 'CAPTURE' AND account."family" = 'MERCHANT_PAYABLE' AND posting."side" = 'CREDIT'
        ), 0) -
        COALESCE(SUM(posting."amount") FILTER (
          WHERE journal."sourceType" = 'REFUND' AND account."family" = 'MERCHANT_PAYABLE' AND posting."side" = 'DEBIT'
        ), 0)
      )::numeric(18,3) AS "merchantNet"
    FROM "FinancialJournal" journal
    JOIN "PaymentIntent" intent ON intent."id" = journal."paymentIntentId"
    JOIN "FinancialPosting" posting ON posting."journalId" = journal."id"
    JOIN "FinancialAccount" account ON account."id" = posting."accountId"
    WHERE intent."organizationId" = ${input.organizationId}::uuid
      AND journal."currency" = ${input.currency}
      AND journal."status" = 'POSTED'
      AND journal."sourceType" IN ('CAPTURE', 'REFUND')
      AND journal."postedAt" >= ${input.periodStart}
      AND journal."postedAt" < ${input.periodEnd}
      AND NOT EXISTS (
        SELECT 1 FROM "SettlementLine" included
        JOIN "SettlementBatch" active ON active."id" = included."settlementBatchId"
        WHERE included."journalId" = journal."id" AND active."status" = 'FINALIZED'
      )
    GROUP BY journal."id", journal."postedAt"
    ORDER BY journal."postedAt" ASC, journal."id" ASC
    LIMIT ${MAX_SETTLEMENT_JOURNALS + 1}
  `);
}

function assertSettlementPeriod(start: Date, end: Date): void {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() - start.getTime() > MAX_PERIOD_MS) {
    paymentError("VALIDATION_ERROR", "Settlement period is invalid or exceeds 366 days.");
  }
}

function zeroSettlementAmounts() {
  return {
    captureGross: paymentDecimal("0", "settlement.captureGross", { allowZero: true }),
    commission: paymentDecimal("0", "settlement.commission", { allowZero: true }),
    merchantNet: paymentDecimal("0", "settlement.merchantNet", { allowZero: true }),
    refunds: paymentDecimal("0", "settlement.refunds", { allowZero: true }),
  };
}
