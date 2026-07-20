import "server-only";

import { Prisma, type FinancialJournalSource, type FinancialJournalStatus } from "@prisma/client";

import {
  assertCommerceAdminCurrent,
  assertMerchantCommerceContextCurrent,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import { decodePaymentCursor, encodePaymentCursor, paymentCursorBinding } from "@/features/payments/domain/cursor";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentMoneyString } from "@/features/payments/domain/money";
import { runPaymentSerializable } from "@/features/payments/services/transaction";
import { getExactPostgresTime } from "@/lib/db/postgres-timestamp";

type PageInput = {
  cursor?: string;
  limit?: number;
  organizationId?: string;
  source?: FinancialJournalSource;
  status?: FinancialJournalStatus;
};

type JournalRow = {
  createdAt: Date;
  creditTotal: Prisma.Decimal;
  currency: string;
  debitTotal: Prisma.Decimal;
  id: string;
  paymentIntentId: string | null;
  postedAt: Date | null;
  sourceType: FinancialJournalSource;
  status: FinancialJournalStatus;
};

export async function listBusinessJournals(reference: MerchantActorReference, input: PageInput = {}) {
  const actor = await resolveMerchantCommerceContext(reference, "SETTLEMENT_VIEW");
  if (input.organizationId) paymentError("VALIDATION_ERROR", "Business Journal scope is server-derived.");
  return listJournals({
    ...input,
    organizationId: actor.organizationId,
    revalidate: (transaction) => assertMerchantCommerceContextCurrent(transaction, actor, "SETTLEMENT_VIEW"),
    scope: paymentCursorBinding({
      kind: "business",
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      personId: actor.personId,
      roleId: actor.roleId,
    }),
  });
}

export function listAdminJournals(context: CommerceAdminContext, input: PageInput = {}) {
  return listJournals({
    ...input,
    revalidate: (transaction) => assertCommerceAdminCurrent(transaction, context, "PAYMENTS_VIEW"),
    scope: paymentCursorBinding({
      adminAccessId: context.adminAccessId,
      kind: "admin",
      personId: context.personId,
      source: context.source,
      userId: context.userId,
    }),
  });
}

async function listJournals(input: PageInput & {
  revalidate: (transaction: Prisma.TransactionClient) => Promise<unknown>;
  scope: string;
}) {
  const pageSize = input.limit ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) paymentError("VALIDATION_ERROR", "limit is invalid.");
  return runPaymentSerializable(async (transaction) => {
    await input.revalidate(transaction);
    const authoritativeNow = await getExactPostgresTime(transaction);
    const filter = paymentCursorBinding({ organizationId: input.organizationId ?? null, source: input.source ?? null, status: input.status ?? null });
    const decoded = input.cursor
      ? decodePaymentCursor("JOURNAL", input.cursor, { filter, pageSize, scope: input.scope }, authoritativeNow)
      : null;
    const snapshot = decoded?.snapshot ?? authoritativeNow;
    const boundary = decoded ? Prisma.sql`AND (journal."createdAt" < ${decoded.sortValue}::timestamptz OR (journal."createdAt" = ${decoded.sortValue}::timestamptz AND journal."id" < ${decoded.id}::uuid))` : Prisma.empty;
    const organization = input.organizationId ? Prisma.sql`AND intent."organizationId" = ${input.organizationId}::uuid` : Prisma.empty;
    const source = input.source ? Prisma.sql`AND journal."sourceType" = ${input.source}::"FinancialJournalSource"` : Prisma.empty;
    const status = input.status ? Prisma.sql`AND journal."status" = ${input.status}::"FinancialJournalStatus"` : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string; sortValue: string }>>(Prisma.sql`
      SELECT journal."id", to_char(journal."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "sortValue"
      FROM "FinancialJournal" journal
      LEFT JOIN "PaymentIntent" intent ON intent."id" = journal."paymentIntentId"
      WHERE journal."createdAt" <= ${snapshot}::timestamptz ${organization} ${source} ${status} ${boundary}
      ORDER BY journal."createdAt" DESC, journal."id" DESC
      LIMIT ${pageSize + 1}
    `);
    const hasNextPage = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const records = pageRows.length ? await transaction.$queryRaw<JournalRow[]>(Prisma.sql`
      SELECT
        journal."id",
        journal."paymentIntentId",
        journal."sourceType",
        journal."status",
        journal."currency",
        journal."postedAt",
        journal."createdAt",
        COALESCE(SUM(posting."amount") FILTER (WHERE posting."side" = 'DEBIT'), 0)::numeric(18,3) AS "debitTotal",
        COALESCE(SUM(posting."amount") FILTER (WHERE posting."side" = 'CREDIT'), 0)::numeric(18,3) AS "creditTotal"
      FROM "FinancialJournal" journal
      LEFT JOIN "FinancialPosting" posting ON posting."journalId" = journal."id"
      WHERE journal."id" IN (${Prisma.join(pageRows.map((row) => Prisma.sql`${row.id}::uuid`))})
      GROUP BY journal."id"
    `) : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = pageRows.map((row) => byId.get(row.id)).filter(Boolean).map((journal) => ({
      kind: "FINANCIAL_JOURNAL_SUMMARY" as const,
      id: journal!.id,
      paymentIntentId: journal!.paymentIntentId,
      source: journal!.sourceType,
      status: journal!.status,
      currency: journal!.currency,
      debitTotal: paymentMoneyString(journal!.debitTotal),
      creditTotal: paymentMoneyString(journal!.creditTotal),
      balanced: journal!.debitTotal.equals(journal!.creditTotal),
      postedAt: journal!.postedAt?.toISOString() ?? null,
      createdAt: journal!.createdAt.toISOString(),
    }));
    const last = hasNextPage ? pageRows.at(-1) : null;
    return {
      kind: "FINANCIAL_JOURNAL_PAGE" as const,
      items,
      nextCursor: last ? encodePaymentCursor("JOURNAL", {
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
