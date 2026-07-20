import "server-only";

import { Prisma, type PaymentIntentStatus, type PaymentRefundStatus } from "@prisma/client";

import {
  assertCommerceAdminCurrent,
  assertMerchantCommerceContextCurrent,
  requireActiveCommerceCustomer,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantActorReference,
  type MerchantCommerceContext,
} from "@/features/commerce/services/authorization";
import {
  decodePaymentCursor,
  encodePaymentCursor,
  paymentCursorBinding,
} from "@/features/payments/domain/cursor";
import { businessPaymentIntentDto, paymentIntentDto, paymentIntentDtoInclude } from "@/features/payments/domain/dto";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentMoneyString } from "@/features/payments/domain/money";
import { runPaymentSerializable } from "@/features/payments/services/transaction";
import { getExactPostgresTime } from "@/lib/db/postgres-timestamp";

type PageInput = {
  cursor?: string | null;
  limit?: number;
};

type QueryActor =
  | { kind: "customer"; personId: string }
  | ({ kind: "business" } & MerchantCommerceContext)
  | ({ kind: "admin" } & CommerceAdminContext);

export async function listCustomerPayments(
  personId: string,
  input: PageInput & { status?: PaymentIntentStatus | null } = {},
) {
  await requireActiveCommerceCustomer(personId);
  return listPaymentIntents({ kind: "customer", personId }, input);
}

export async function listBusinessPayments(
  reference: MerchantActorReference,
  input: PageInput & { status?: PaymentIntentStatus | null } = {},
) {
  const actor = await resolveMerchantCommerceContext(reference, "PAYMENT_VIEW");
  const page = await listPaymentIntents({ ...actor, kind: "business" }, input);
  return { ...page, items: page.items as Array<ReturnType<typeof businessPaymentIntentDto>> };
}

export function listAdminPayments(
  context: CommerceAdminContext,
  input: PageInput & { organizationId?: string | null; status?: PaymentIntentStatus | null } = {},
) {
  return listPaymentIntents({ ...context, kind: "admin" }, input).then((page) => ({
    ...page,
    items: page.items as Array<ReturnType<typeof businessPaymentIntentDto>>,
  }));
}

export async function getBusinessPayment(reference: MerchantActorReference, intentId: string) {
  const actor = await resolveMerchantCommerceContext(reference, "PAYMENT_VIEW");
  return runPaymentSerializable(async (transaction) => {
    await assertMerchantCommerceContextCurrent(transaction, actor, "PAYMENT_VIEW");
    const intent = await transaction.paymentIntent.findFirst({
      where: { id: intentId, organizationId: actor.organizationId },
      include: paymentIntentDtoInclude,
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    return businessPaymentIntentDto(intent);
  });
}

export function getAdminPayment(context: CommerceAdminContext, intentId: string) {
  return runPaymentSerializable(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "PAYMENTS_VIEW");
    const intent = await transaction.paymentIntent.findUnique({
      where: { id: intentId },
      include: paymentIntentDtoInclude,
    });
    if (!intent) paymentError("NOT_FOUND", "Payment was not found.");
    return businessPaymentIntentDto(intent);
  });
}

async function listPaymentIntents(
  actor: QueryActor,
  input: PageInput & { organizationId?: string | null; status?: PaymentIntentStatus | null },
) {
  const pageSize = pageSizeValue(input.limit);
  return runPaymentSerializable(async (transaction) => {
    await assertActor(transaction, actor, "PAYMENTS_VIEW");
    const authoritativeNow = await getExactPostgresTime(transaction);
    const filter = paymentCursorBinding({ organizationId: input.organizationId ?? null, status: input.status ?? null });
    const scope = paymentCursorBinding(scopeValue(actor));
    const decoded = input.cursor
      ? decodePaymentCursor("INTENT", input.cursor, { filter, pageSize, scope }, authoritativeNow)
      : null;
    const snapshot = decoded?.snapshot ?? authoritativeNow;
    const boundary = decoded
      ? Prisma.sql`AND (
          intent."createdAt" < ${decoded.sortValue}::timestamptz OR
          (intent."createdAt" = ${decoded.sortValue}::timestamptz AND intent."id" < ${decoded.id}::uuid)
        )`
      : Prisma.empty;
    const status = input.status ? Prisma.sql`AND intent."status" = ${input.status}::"PaymentIntentStatus"` : Prisma.empty;
    const organization = actor.kind === "admin" && input.organizationId
      ? Prisma.sql`AND intent."organizationId" = ${input.organizationId}::uuid`
      : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string; sortValue: string }>>(Prisma.sql`
      SELECT intent."id", to_char(
        intent."createdAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "sortValue"
      FROM "PaymentIntent" intent
      WHERE ${intentScope(actor)}
        AND intent."createdAt" <= ${snapshot}::timestamptz
        ${status}
        ${organization}
        ${boundary}
      ORDER BY intent."createdAt" DESC, intent."id" DESC
      LIMIT ${pageSize + 1}
    `);
    const hasNextPage = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const records = pageRows.length
      ? await transaction.paymentIntent.findMany({
          where: { id: { in: pageRows.map((row) => row.id) } },
          include: paymentIntentDtoInclude,
        })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = pageRows.map((row) => byId.get(row.id)).filter(Boolean).map((record) =>
      actor.kind === "customer" ? paymentIntentDto(record!) : businessPaymentIntentDto(record!),
    );
    const last = hasNextPage ? pageRows.at(-1) : null;
    return {
      kind: "PAYMENT_PAGE" as const,
      items,
      pageSize,
      nextCursor: last
        ? encodePaymentCursor("INTENT", { filter, id: last.id, pageSize, scope, snapshot, sortValue: last.sortValue })
        : null,
    };
  });
}

export async function listBusinessRefunds(
  reference: MerchantActorReference,
  input: PageInput & { status?: PaymentRefundStatus | null } = {},
) {
  const actor = await resolveMerchantCommerceContext(reference, "PAYMENT_VIEW");
  return listRefunds({ ...actor, kind: "business" }, input);
}

export function listAdminRefunds(
  context: CommerceAdminContext,
  input: PageInput & { organizationId?: string | null; status?: PaymentRefundStatus | null } = {},
) {
  return listRefunds({ ...context, kind: "admin" }, input);
}

async function listRefunds(
  actor: Extract<QueryActor, { kind: "business" | "admin" }>,
  input: PageInput & { organizationId?: string | null; status?: PaymentRefundStatus | null },
) {
  const pageSize = pageSizeValue(input.limit);
  return runPaymentSerializable(async (transaction) => {
    await assertActor(transaction, actor, "PAYMENTS_VIEW");
    const authoritativeNow = await getExactPostgresTime(transaction);
    const filter = paymentCursorBinding({ organizationId: input.organizationId ?? null, status: input.status ?? null });
    const scope = paymentCursorBinding(scopeValue(actor));
    const decoded = input.cursor
      ? decodePaymentCursor("REFUND", input.cursor, { filter, pageSize, scope }, authoritativeNow)
      : null;
    const snapshot = decoded?.snapshot ?? authoritativeNow;
    const boundary = decoded
      ? Prisma.sql`AND (
          refund."createdAt" < ${decoded.sortValue}::timestamptz OR
          (refund."createdAt" = ${decoded.sortValue}::timestamptz AND refund."id" < ${decoded.id}::uuid)
        )`
      : Prisma.empty;
    const status = input.status ? Prisma.sql`AND refund."status" = ${input.status}::"PaymentRefundStatus"` : Prisma.empty;
    const organization = actor.kind === "admin" && input.organizationId
      ? Prisma.sql`AND intent."organizationId" = ${input.organizationId}::uuid`
      : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string; sortValue: string }>>(Prisma.sql`
      SELECT refund."id", to_char(
        refund."createdAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "sortValue"
      FROM "PaymentRefund" refund
      JOIN "PaymentIntent" intent ON intent."id" = refund."paymentIntentId"
      WHERE ${intentScope(actor)}
        AND refund."createdAt" <= ${snapshot}::timestamptz
        ${status}
        ${organization}
        ${boundary}
      ORDER BY refund."createdAt" DESC, refund."id" DESC
      LIMIT ${pageSize + 1}
    `);
    const hasNextPage = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const records = pageRows.length
      ? await transaction.paymentRefund.findMany({ where: { id: { in: pageRows.map((row) => row.id) } } })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = pageRows.map((row) => byId.get(row.id)).filter(Boolean).map((refund) => ({
      kind: "PAYMENT_REFUND" as const,
      id: refund!.id,
      paymentIntentId: refund!.paymentIntentId,
      amount: paymentMoneyString(refund!.amount),
      currency: refund!.currency,
      reason: refund!.reasonCode,
      status: refund!.status,
      version: refund!.version,
      createdAt: refund!.createdAt.toISOString(),
      completedAt: refund!.completedAt?.toISOString() ?? null,
    }));
    const last = hasNextPage ? pageRows.at(-1) : null;
    return {
      kind: "REFUND_PAGE" as const,
      items,
      pageSize,
      nextCursor: last
        ? encodePaymentCursor("REFUND", { filter, id: last.id, pageSize, scope, snapshot, sortValue: last.sortValue })
        : null,
    };
  });
}

function intentScope(actor: QueryActor) {
  if (actor.kind === "customer") return Prisma.sql`intent."customerPersonId" = ${actor.personId}::uuid`;
  if (actor.kind === "business") return Prisma.sql`intent."organizationId" = ${actor.organizationId}::uuid`;
  return Prisma.sql`TRUE`;
}

async function assertActor(
  transaction: Prisma.TransactionClient,
  actor: QueryActor,
  adminPermission: "PAYMENTS_VIEW",
) {
  if (actor.kind === "customer") return requireActiveCommerceCustomer(actor.personId, transaction);
  if (actor.kind === "business") return assertMerchantCommerceContextCurrent(transaction, actor, "PAYMENT_VIEW");
  return assertCommerceAdminCurrent(transaction, actor, adminPermission);
}

function scopeValue(actor: QueryActor) {
  if (actor.kind === "customer") return { kind: actor.kind, personId: actor.personId };
  if (actor.kind === "business") {
    return {
      kind: actor.kind,
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      personId: actor.personId,
      roleId: actor.roleId,
    };
  }
  return {
    adminAccessId: actor.adminAccessId,
    kind: actor.kind,
    personId: actor.personId,
    source: actor.source,
    userId: actor.userId,
  };
}

function pageSizeValue(value: number | undefined): number {
  const pageSize = value ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    paymentError("VALIDATION_ERROR", "limit must be an integer between 1 and 50.");
  }
  return pageSize;
}
