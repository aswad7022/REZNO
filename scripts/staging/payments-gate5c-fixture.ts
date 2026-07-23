import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const PAYMENTS_GATE5C_MARKER = "rezno-qa-payments-gate5c";
const baseTime = new Date("2026-07-19T14:00:00.123Z");
const postedTime = process.env.REZNO_STAGE6_GATE6C_SUCCESSOR === "true"
  ? new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() - 1,
      14,
      30,
      0,
      456,
    ))
  : new Date("2026-07-19T14:30:00.456Z");
const id = (value: number) => `5c000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const hash = (value: string) => createHash("sha256").update(`${PAYMENTS_GATE5C_MARKER}:${value}`).digest("hex");

const personIds = Array.from({ length: 13 }, (_, index) => id(index + 1));
const userIds = personIds.map((_, index) => `${PAYMENTS_GATE5C_MARKER}-user-${index + 1}`);
const organizationIds = [id(101), id(102)];
const settingsIds = [id(111), id(112)];
const storeIds = [id(121), id(122)];
const branchIds = [id(131), id(132)];
const roleIds = Array.from({ length: 6 }, (_, index) => id(201 + index));
const memberIds = Array.from({ length: 6 }, (_, index) => id(301 + index));
const adminAccessIds = Array.from({ length: 5 }, (_, index) => id(401 + index));
const orderIds = Array.from({ length: 10 }, (_, index) => id(1001 + index));
const bookingIds = [id(1101), id(1102)];
const paymentIds = orderIds.map((_, index) => id(1201 + index));
const intentIds = Array.from({ length: 11 }, (_, index) => id(2001 + index));
const attemptIds = Array.from({ length: 13 }, (_, index) => id(2201 + index));
const eventIds = [id(2301), id(2302), id(2303)];
const refundIds = [id(2401), id(2402)];
const mutationIds = [id(2501), id(2502), id(2503)];
const accountIds = {
  merchant: id(3001),
  platform: id(3002),
  provider: id(3003),
  refund: id(3004),
} as const;
const journalIds = Array.from({ length: 7 }, (_, index) => id(3101 + index));
const postingIds = Array.from({ length: journalIds.length * 2 }, (_, index) => id(3201 + index));
const settlementBatchIds = [id(3401), id(3402)];
const settlementLineIds = [id(3501), id(3502), id(3503)];

export const paymentsGate5cFixtureIds = {
  accountIds,
  adminAccessIds,
  attemptIds,
  bookingIds,
  branchIds,
  eventIds,
  intentIds,
  journalIds,
  memberIds,
  mutationIds,
  orderIds,
  organizationIds,
  paymentIds,
  personIds,
  postingIds,
  refundIds,
  roleIds,
  settingsIds,
  settlementBatchIds,
  settlementLineIds,
  storeIds,
  userIds,
};

export async function cleanupPaymentsGate5cFixture(prisma: PrismaClient) {
  const counts = {
    notificationStates: (await prisma.notificationRecipientState.deleteMany({ where: { personId: { in: personIds } } })).count,
    notifications: (await prisma.notification.deleteMany({ where: { sourceId: { in: [...intentIds, ...refundIds, ...settlementBatchIds] } } })).count,
    adminAuditLogs: (await prisma.adminAuditLog.deleteMany({ where: { adminUserId: { in: userIds } } })).count,
    businessAuditLogs: (await prisma.businessAuditLog.deleteMany({ where: { actorPersonId: { in: personIds } } })).count,
    settlementLines: (await prisma.settlementLine.deleteMany({ where: { id: { in: settlementLineIds } } })).count,
    settlementBatches: (await prisma.settlementBatch.deleteMany({ where: { id: { in: settlementBatchIds } } })).count,
    postings: (await prisma.financialPosting.deleteMany({ where: { id: { in: postingIds } } })).count,
    journals: (await prisma.financialJournal.deleteMany({ where: { id: { in: journalIds } } })).count,
    refunds: (await prisma.paymentRefund.deleteMany({ where: { id: { in: refundIds } } })).count,
    providerEvents: (await prisma.paymentProviderEvent.deleteMany({ where: { id: { in: eventIds } } })).count,
    attempts: (await prisma.paymentAttempt.deleteMany({ where: { id: { in: attemptIds } } })).count,
    mutations: (await prisma.paymentMutation.deleteMany({ where: { id: { in: mutationIds } } })).count,
    payments: (await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } })).count,
    intents: (await prisma.paymentIntent.deleteMany({ where: { id: { in: intentIds } } })).count,
    accounts: (await prisma.financialAccount.deleteMany({ where: { id: { in: Object.values(accountIds) } } })).count,
    orders: (await prisma.order.deleteMany({ where: { id: { in: orderIds } } })).count,
    bookings: (await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } })).count,
    stores: (await prisma.store.deleteMany({ where: { id: { in: storeIds } } })).count,
    branches: (await prisma.branch.deleteMany({ where: { id: { in: branchIds } } })).count,
    adminAccess: (await prisma.adminAccess.deleteMany({ where: { id: { in: adminAccessIds } } })).count,
    members: (await prisma.organizationMember.deleteMany({ where: { id: { in: memberIds } } })).count,
    roles: (await prisma.role.deleteMany({ where: { id: { in: roleIds } } })).count,
    settings: (await prisma.organizationSettings.deleteMany({ where: { id: { in: settingsIds } } })).count,
    organizations: (await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } })).count,
    people: (await prisma.person.deleteMany({ where: { id: { in: personIds } } })).count,
    users: (await prisma.user.deleteMany({ where: { id: { in: userIds } } })).count,
  };
  return counts;
}

export async function seedPaymentsGate5cFixture(prisma: PrismaClient) {
  await cleanupPaymentsGate5cFixture(prisma);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.createMany({ data: userIds.map((userId, index) => ({
      createdAt: baseTime,
      email: `${PAYMENTS_GATE5C_MARKER}-${index + 1}@rezno.invalid`,
      emailVerified: true,
      id: userId,
      name: `Gate 5C actor ${index + 1}`,
      updatedAt: baseTime,
    })) });
    await transaction.person.createMany({ data: personIds.map((personId, index) => ({
      authUserId: userIds[index]!,
      createdAt: baseTime,
      firstName: `Gate5C-${index + 1}`,
      id: personId,
      isOnboarded: true,
      status: "ACTIVE",
      updatedAt: baseTime,
    })) });
    await transaction.organization.createMany({ data: [
      { createdAt: baseTime, id: organizationIds[0]!, isActive: true, name: "Gate 5C payment organization", slug: PAYMENTS_GATE5C_MARKER, status: "ACTIVE", updatedAt: baseTime },
      { createdAt: baseTime, id: organizationIds[1]!, isActive: true, name: "Gate 5C foreign organization", slug: `${PAYMENTS_GATE5C_MARKER}-foreign`, status: "ACTIVE", updatedAt: baseTime },
    ] });
    await transaction.organizationSettings.createMany({ data: organizationIds.map((organizationId, index) => ({
      allowOnlinePayments: true,
      createdAt: baseTime,
      id: settingsIds[index]!,
      organizationId,
      updatedAt: baseTime,
    })) });
    await transaction.store.createMany({ data: organizationIds.map((organizationId, index) => ({
      createdAt: baseTime,
      id: storeIds[index]!,
      name: index === 0 ? "Gate 5C Store" : "Gate 5C Foreign Store",
      organizationId,
      pickupEnabled: true,
      slug: index === 0 ? PAYMENTS_GATE5C_MARKER : `${PAYMENTS_GATE5C_MARKER}-foreign`,
      status: "ACTIVE",
      updatedAt: baseTime,
    })) });
    await transaction.branch.createMany({ data: organizationIds.map((organizationId, index) => ({
      createdAt: baseTime,
      id: branchIds[index]!,
      name: index === 0 ? "Gate 5C Branch" : "Gate 5C Foreign Branch",
      organizationId,
      slug: index === 0 ? "gate5c-branch" : "gate5c-foreign-branch",
      updatedAt: baseTime,
    })) });
    const roleKinds = ["OWNER", "MANAGER", "RECEPTIONIST", "STAFF", "MANAGER", "OWNER"] as const;
    await transaction.role.createMany({ data: roleIds.map((roleId, index) => ({
      commercePermissions: index === 1 || index === 4 ? ["PAYMENT_VIEW", "PAYMENT_REFUND", "SETTLEMENT_VIEW"] : [],
      createdAt: baseTime,
      id: roleId,
      isSystem: true,
      name: `${PAYMENTS_GATE5C_MARKER}-${roleKinds[index]}-${index + 1}`,
      organizationId: index === 5 ? organizationIds[1]! : organizationIds[0]!,
      systemRole: roleKinds[index]!,
      updatedAt: baseTime,
    })) });
    await transaction.organizationMember.createMany({ data: memberIds.map((memberId, index) => ({
      createdAt: baseTime,
      id: memberId,
      organizationId: index === 5 ? organizationIds[1]! : organizationIds[0]!,
      personId: personIds[index + 2]!,
      roleId: roleIds[index]!,
      status: index === 4 ? "INACTIVE" : "ACTIVE",
      updatedAt: baseTime,
    })) });
    await transaction.adminAccess.createMany({ data: [
      { createdAt: baseTime, id: adminAccessIds[0]!, permissions: ["PAYMENTS_VIEW", "PAYMENTS_REFUND", "PAYMENTS_RECONCILE", "SETTLEMENTS_VIEW", "SETTLEMENTS_MANAGE"], status: "ACTIVE", updatedAt: baseTime, userId: userIds[8]! },
      { createdAt: baseTime, id: adminAccessIds[1]!, permissions: ["PAYMENTS_VIEW", "SETTLEMENTS_VIEW"], status: "ACTIVE", updatedAt: baseTime, userId: userIds[9]! },
      { createdAt: baseTime, id: adminAccessIds[2]!, permissions: ["PAYMENTS_VIEW", "PAYMENTS_REFUND"], status: "ACTIVE", updatedAt: baseTime, userId: userIds[10]! },
      { createdAt: baseTime, id: adminAccessIds[3]!, permissions: ["PAYMENTS_VIEW", "PAYMENTS_RECONCILE"], status: "ACTIVE", updatedAt: baseTime, userId: userIds[11]! },
      { createdAt: baseTime, id: adminAccessIds[4]!, permissions: ["PAYMENTS_VIEW", "PAYMENTS_REFUND", "PAYMENTS_RECONCILE", "SETTLEMENTS_VIEW", "SETTLEMENTS_MANAGE"], status: "REVOKED", updatedAt: baseTime, userId: userIds[12]! },
    ] });
    await transaction.order.createMany({ data: orderIds.map((orderId, index) => ({
      createdAt: at(index),
      currency: "IQD",
      customerId: index === 9 ? personIds[1]! : personIds[0]!,
      customerNameSnapshot: `Gate 5C Customer ${index + 1}`,
      customerPhoneSnapshot: "+9647000000000",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: amount(index),
      id: orderId,
      orderNumber: `GATE5C-${String(index + 1).padStart(3, "0")}`,
      paymentMethod: index === 9 ? "PAY_AT_PICKUP" : "ONLINE_PROVIDER",
      paymentStatus: targetPaymentStatus(index),
      pickupAddressSnapshot: "Gate 5C pickup",
      reservationExpiresAt: new Date("2027-07-20T14:00:00.123Z"),
      storeId: index === 9 ? storeIds[1]! : storeIds[0]!,
      storeNameSnapshot: index === 9 ? "Gate 5C Foreign Store" : "Gate 5C Store",
      storeSlugSnapshot: index === 9 ? `${PAYMENTS_GATE5C_MARKER}-foreign` : PAYMENTS_GATE5C_MARKER,
      subtotal: amount(index),
      updatedAt: at(index),
    })) });
    await transaction.booking.createMany({ data: [
      { branchId: branchIds[0]!, createdAt: at(20), currency: "IQD", customerId: personIds[0]!, customerNameSnapshot: "Gate 5C Customer A", endsAt: new Date("2027-07-21T11:00:00.123Z"), id: bookingIds[0]!, organizationId: organizationIds[0]!, paymentMethod: "ONLINE_PROVIDER", paymentStatus: "PAID", priceSnapshot: "18000.00", serviceNameSnapshot: "Gate 5C Booking Paid", startsAt: new Date("2027-07-21T10:00:00.123Z"), updatedAt: at(20) },
      { branchId: branchIds[1]!, createdAt: at(21), currency: "IQD", customerId: personIds[1]!, customerNameSnapshot: "Gate 5C Customer B", endsAt: new Date("2027-07-21T13:00:00.123Z"), id: bookingIds[1]!, organizationId: organizationIds[1]!, paymentStatus: "UNPAID", priceSnapshot: "19000.00", serviceNameSnapshot: "Gate 5C Foreign Booking", startsAt: new Date("2027-07-21T12:00:00.123Z"), updatedAt: at(21) },
    ] });
    await transaction.paymentIntent.createMany({ data: intentDefinitions() });
    await transaction.payment.createMany({ data: paymentIds.map((paymentId, index) => ({
      amount: amount(index),
      createdAt: at(index),
      currency: "IQD",
      id: paymentId,
      method: index === 9 ? "PAY_AT_PICKUP" : "ONLINE_PROVIDER",
      orderId: orderIds[index]!,
      paidAt: [3, 4, 5].includes(index) ? postedTime : null,
      paymentIntentId: index === 9 ? null : intentIds[index]!,
      status: targetPaymentStatus(index),
      updatedAt: at(index),
      voidedAt: [7, 8].includes(index) ? postedTime : null,
    })) });
    await transaction.paymentAttempt.createMany({ data: attemptDefinitions() });
    await transaction.paymentProviderEvent.createMany({ data: [
      { createdAt: at(40), id: eventIds[0]!, normalizedType: "CAPTURED", occurredAt: at(40), payloadHash: hash("event-capture"), paymentIntentId: intentIds[3]!, processedAt: at(40), provider: "DETERMINISTIC_TEST", providerEventId: `${PAYMENTS_GATE5C_MARKER}-capture`, providerReference: providerReference(3), status: "PROCESSED", updatedAt: at(40), verifiedAt: at(40) },
      { createdAt: at(41), id: eventIds[1]!, normalizedType: "AUTHORIZED", occurredAt: at(39), payloadHash: hash("event-old-authorized"), paymentIntentId: intentIds[3]!, processedAt: at(41), provider: "DETERMINISTIC_TEST", providerEventId: `${PAYMENTS_GATE5C_MARKER}-old-authorized`, providerReference: providerReference(3), status: "IGNORED", updatedAt: at(41), verifiedAt: at(41) },
      { createdAt: at(42), id: eventIds[2]!, normalizedType: "CAPTURED", occurredAt: at(42), payloadHash: hash("event-late-capture"), paymentIntentId: intentIds[8]!, processedAt: at(42), provider: "DETERMINISTIC_TEST", providerEventId: `${PAYMENTS_GATE5C_MARKER}-late-capture`, providerReference: providerReference(8), status: "PROCESSED", updatedAt: at(42), verifiedAt: at(42) },
    ] });
    await transaction.paymentRefund.createMany({ data: [
      { amount: "5000.000", completedAt: postedTime, createdAt: at(50), currency: "IQD", id: refundIds[0]!, idempotencyKey: id(2451), paymentIntentId: intentIds[4]!, providerReference: `${PAYMENTS_GATE5C_MARKER}-refund-partial`, reasonCode: "CUSTOMER_REQUEST", requestHash: hash("refund-partial"), requestedByActorId: personIds[2]!, requestedByActorType: "MERCHANT", status: "SUCCEEDED", updatedAt: at(50), version: 2 },
      { amount: "15000.000", completedAt: postedTime, createdAt: at(51), currency: "IQD", id: refundIds[1]!, idempotencyKey: id(2452), paymentIntentId: intentIds[5]!, providerReference: `${PAYMENTS_GATE5C_MARKER}-refund-full`, reasonCode: "CUSTOMER_REQUEST", requestHash: hash("refund-full"), requestedByActorId: userIds[10]!, requestedByActorType: "ADMIN", status: "SUCCEEDED", updatedAt: at(51), version: 2 },
    ] });
    await transaction.paymentMutation.createMany({ data: [
      mutation(0, "CREATE_INTENT", "CUSTOMER", `customer:${personIds[0]}`, personIds[0]!, intentIds[0]!, orderIds[0]!, "ORDER"),
      mutation(1, "PROCESS_PROVIDER_EVENT", "PROVIDER", "provider:deterministic", null, intentIds[3]!, orderIds[3]!, "ORDER"),
      mutation(2, "REQUEST_REFUND", "MERCHANT", `merchant:${memberIds[0]}`, personIds[2]!, intentIds[4]!, orderIds[4]!, "ORDER"),
    ] });
    const resolvedAccountIds = await ensureFixtureFinancialAccounts(transaction);
    await transaction.financialJournal.createMany({ data: journalDefinitions() });
    await transaction.financialPosting.createMany({ data: postingDefinitions(resolvedAccountIds) });
    await transaction.settlementBatch.createMany({ data: settlementBatchIds.map((batchId, index) => ({
      createdAt: at(80 + index),
      currency: "IQD",
      id: batchId,
      idempotencyKey: id(3451 + index),
      organizationId: organizationIds[0]!,
      periodEnd: settlementPeriod(index).end,
      periodStart: settlementPeriod(index).start,
      requestHash: hash(`settlement-${index}`),
      status: "DRAFT",
      updatedAt: at(80 + index),
    })) });
  }, { isolationLevel: "Serializable" });
  return materializePaymentsGate5cEvidence(prisma);
}

export async function materializePaymentsGate5cEvidence(prisma: PrismaClient) {
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.financialJournal.updateMany({
        where: { id: { in: journalIds } },
        data: { postedAt: postedTime, status: "POSTED" },
      });
      await transaction.$executeRawUnsafe('SET CONSTRAINTS "FinancialJournal_balance_trigger" IMMEDIATE');
      await transaction.settlementLine.createMany({ data: [
        settlementLine(0, journalIds[0]!, "13000.000", "0.000", "13000.000"),
        settlementLine(1, journalIds[1]!, "14000.000", "0.000", "14000.000"),
        settlementLine(2, journalIds[2]!, "0.000", "5000.000", "-5000.000"),
      ] });
      await transaction.settlementBatch.update({
        where: { id: settlementBatchIds[0] },
        data: {
          captureGross: "27000.000",
          finalizedAt: postedTime,
          finalizedByAdminId: userIds[8]!,
          merchantNet: "22000.000",
          refunds: "5000.000",
          status: "FINALIZED",
          updatedAt: postedTime,
          version: 2,
        },
      });
      const journalImmutable = await rejectedAtSavepoint(transaction, "gate5c_journal_immutable", () =>
        transaction.financialJournal.update({ where: { id: journalIds[0] }, data: { sourceId: id(3991) } }));
      const postingImmutable = await rejectedAtSavepoint(transaction, "gate5c_posting_immutable", () =>
        transaction.financialPosting.delete({ where: { id: postingIds[0] } }));
      const settlementImmutable = await rejectedAtSavepoint(transaction, "gate5c_settlement_immutable", () =>
        transaction.settlementBatch.update({ where: { id: settlementBatchIds[0] }, data: { merchantNet: "1.000" } }));
      const settlementDoubleInclusionRejected = await rejectedAtSavepoint(transaction, "gate5c_settlement_double", async () => {
        await transaction.settlementLine.create({
          data: {
            ...settlementLine(2, journalIds[0]!, "13000.000", "0.000", "13000.000"),
            id: id(3599),
            settlementBatchId: settlementBatchIds[1]!,
          },
        });
        await transaction.settlementBatch.update({
          where: { id: settlementBatchIds[1] },
          data: { captureGross: "13000.000", finalizedAt: postedTime, finalizedByAdminId: userIds[8]!, merchantNet: "13000.000", status: "FINALIZED", version: 2 },
        });
      });
      const overRefundRejected = await rejectedAtSavepoint(transaction, "gate5c_over_refund", () =>
        transaction.paymentRefund.create({
          data: {
            amount: "10000.000",
            currency: "IQD",
            id: id(2499),
            idempotencyKey: id(2498),
            paymentIntentId: intentIds[4]!,
            reasonCode: "OTHER",
            requestHash: hash("over-refund"),
            requestedByActorId: personIds[2]!,
            requestedByActorType: "MERCHANT",
          },
        }));
      const balances = await transaction.$queryRaw<Array<{ credit: Prisma.Decimal; debit: Prisma.Decimal }>>(Prisma.sql`
        SELECT
          COALESCE(SUM("amount") FILTER (WHERE "side" = 'DEBIT'), 0)::numeric(18,3) AS debit,
          COALESCE(SUM("amount") FILTER (WHERE "side" = 'CREDIT'), 0)::numeric(18,3) AS credit
        FROM "FinancialPosting" WHERE "journalId" IN (${Prisma.join(journalIds.map((journalId) => Prisma.sql`${journalId}::uuid`))})
      `);
      const fingerprint = await paymentsGate5cFingerprint(transaction);
      throw new FixtureRollback(fingerprint, {
        balanced: balances[0]?.credit.equals(balances[0]?.debit) ?? false,
        finalizedSettlement: true,
        journalCount: journalIds.length,
        journalImmutable,
        meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT" as const,
        overRefundRejected,
        postingImmutable,
        settlementDoubleInclusionRejected,
        settlementImmutable,
      });
    }, { isolationLevel: "Serializable", timeout: 30_000 });
  } catch (error) {
    if (error instanceof FixtureRollback) return { evidence: error.evidence, fingerprint: error.fingerprint };
    throw error;
  }
  throw new Error("Gate 5C rollback-only evidence transaction unexpectedly committed.");
}

type FingerprintClient = Pick<Prisma.TransactionClient, "paymentIntent" | "paymentAttempt" | "paymentProviderEvent" | "paymentRefund" | "financialJournal" | "financialPosting" | "settlementBatch" | "settlementLine" | "organizationMember" | "adminAccess">;

async function paymentsGate5cFingerprint(prisma: FingerprintClient) {
  const [intents, attempts, events, refunds, journals, postings, settlements, lines, members, admins] = await Promise.all([
    prisma.paymentIntent.findMany({ where: { id: { in: intentIds } }, orderBy: { id: "asc" }, select: { amount: true, capturedAmount: true, commissionAmount: true, id: true, refundedAmount: true, status: true } }),
    prisma.paymentAttempt.findMany({ where: { id: { in: attemptIds } }, orderBy: { id: "asc" }, select: { attemptNumber: true, id: true, paymentIntentId: true, status: true } }),
    prisma.paymentProviderEvent.findMany({ where: { id: { in: eventIds } }, orderBy: { id: "asc" }, select: { id: true, normalizedType: true, status: true } }),
    prisma.paymentRefund.findMany({ where: { id: { in: refundIds } }, orderBy: { id: "asc" }, select: { amount: true, id: true, status: true } }),
    prisma.financialJournal.findMany({ where: { id: { in: journalIds } }, orderBy: { id: "asc" }, select: { id: true, sourceType: true, status: true } }),
    prisma.financialPosting.findMany({ where: { id: { in: postingIds } }, orderBy: { id: "asc" }, select: { amount: true, id: true, journalId: true, side: true } }),
    prisma.settlementBatch.findMany({ where: { id: { in: settlementBatchIds } }, orderBy: { id: "asc" }, select: { id: true, merchantNet: true, status: true, version: true } }),
    prisma.settlementLine.findMany({ where: { id: { in: settlementLineIds } }, orderBy: { id: "asc" }, select: { id: true, journalId: true, merchantNet: true } }),
    prisma.organizationMember.findMany({ where: { id: { in: memberIds } }, orderBy: { id: "asc" }, select: { id: true, roleId: true, status: true } }),
    prisma.adminAccess.findMany({ where: { id: { in: adminAccessIds } }, orderBy: { id: "asc" }, select: { id: true, permissions: true, status: true } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ admins, attempts, events, intents, journals, lines, members, postings, refunds, settlements })).digest("hex");
}

class FixtureRollback extends Error {
  constructor(readonly fingerprint: string, readonly evidence: {
    balanced: boolean;
    finalizedSettlement: boolean;
    journalCount: number;
    journalImmutable: boolean;
    meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT";
    overRefundRejected: boolean;
    postingImmutable: boolean;
    settlementDoubleInclusionRejected: boolean;
    settlementImmutable: boolean;
  }) {
    super("Gate 5C fixture evidence rollback");
  }
}

async function rejectedAtSavepoint(
  transaction: Prisma.TransactionClient,
  savepoint: string,
  operation: () => Promise<unknown>,
) {
  await transaction.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await operation();
    await transaction.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await transaction.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
    return false;
  } catch {
    await transaction.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await transaction.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
    return true;
  }
}

function at(offset: number) {
  return new Date(baseTime.getTime() + offset * 1_000);
}

function amount(index: number) {
  return `${10000 + index * 1000}.000`;
}

function targetPaymentStatus(index: number) {
  if (index === 3) return "PAID" as const;
  if (index === 4) return "PARTIALLY_REFUNDED" as const;
  if (index === 5) return "REFUNDED" as const;
  if (index === 7 || index === 8) return "VOIDED" as const;
  return "UNPAID" as const;
}

function providerReference(index: number) {
  return `${PAYMENTS_GATE5C_MARKER}-provider-${index + 1}`;
}

function settlementPeriod(index: number) {
  if (process.env.REZNO_STAGE6_GATE6C_SUCCESSOR !== "true") {
    return index === 0
      ? {
          end: new Date("2026-07-20T00:00:00.000Z"),
          start: new Date("2026-07-19T00:00:00.000Z"),
        }
      : {
          end: new Date("2026-07-19T00:00:00.000Z"),
          start: new Date("2026-07-18T00:00:00.000Z"),
        };
  }
  const primaryEnd = new Date(Date.UTC(
    postedTime.getUTCFullYear(),
    postedTime.getUTCMonth(),
    postedTime.getUTCDate() + 1,
  ));
  const end = new Date(primaryEnd.getTime() - index * 86_400_000);
  return { end, start: new Date(end.getTime() - 86_400_000) };
}

function intentDefinitions(): Prisma.PaymentIntentCreateManyInput[] {
  const statuses = ["CREATED", "REQUIRES_ACTION", "AUTHORIZED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "CANCELLED", "CANCELLED"] as const;
  const orderIntents = statuses.map((status, index): Prisma.PaymentIntentCreateManyInput => {
    const captured = [3, 4, 5, 8].includes(index) ? amount(index) : "0.000";
    const refunded = index === 4 ? "5000.000" : index === 5 ? amount(index) : "0.000";
    return {
      amount: amount(index),
      authorizedAt: status === "AUTHORIZED" ? at(30 + index) : null,
      cancelledAt: status === "CANCELLED" ? at(30 + index) : null,
      capturedAmount: captured,
      capturedAt: new Prisma.Decimal(captured).isPositive() ? at(30 + index) : null,
      commissionAmount: "0.000",
      commissionBasisPoints: 0,
      commissionPolicyId: "zero-v1",
      createdAt: at(index),
      currency: "IQD",
      customerPersonId: personIds[0]!,
      failedAt: status === "FAILED" ? at(30 + index) : null,
      id: intentIds[index]!,
      merchantNetAmount: captured,
      method: "ONLINE_PROVIDER",
      orderId: orderIds[index]!,
      organizationId: organizationIds[0]!,
      provider: "DETERMINISTIC_TEST",
      providerReference: providerReference(index),
      refundedAmount: refunded,
      status,
      storeId: storeIds[0]!,
      updatedAt: at(index),
      version: status === "CREATED" ? 1 : 2,
    };
  });
  return [
    ...orderIntents,
    { amount: "18000.000", capturedAmount: "18000.000", capturedAt: at(39), commissionAmount: "0.000", commissionBasisPoints: 0, commissionPolicyId: "zero-v1", createdAt: at(20), currency: "IQD", customerPersonId: personIds[0]!, id: intentIds[9]!, merchantNetAmount: "18000.000", method: "ONLINE_PROVIDER", organizationId: organizationIds[0]!, bookingId: bookingIds[0]!, provider: "DETERMINISTIC_TEST", providerReference: providerReference(9), status: "CAPTURED", updatedAt: at(39), version: 2 },
    { amount: "19000.000", commissionAmount: "0.000", commissionBasisPoints: 0, commissionPolicyId: "zero-v1", createdAt: at(21), currency: "IQD", customerPersonId: personIds[1]!, id: intentIds[10]!, merchantNetAmount: "0.000", method: "ONLINE_PROVIDER", organizationId: organizationIds[1]!, bookingId: bookingIds[1]!, provider: "DETERMINISTIC_TEST", providerReference: providerReference(10), status: "CREATED", updatedAt: at(21) },
  ];
}

function attemptDefinitions(): Prisma.PaymentAttemptCreateManyInput[] {
  return attemptIds.map((attemptId, index) => {
    const intentIndex = index < 3 ? 1 : index === 12 ? 0 : index - 1;
    const attemptNumber = index < 3 ? index + 1 : 1;
    const status = index === 0 ? "FAILED" : index === 1 ? "REQUIRES_ACTION" : index === 2 ? "AUTHORIZED" : [4, 5, 6, 10].includes(index) ? "CAPTURED" : index === 9 ? "FAILED" : "CREATED";
    const requiresAction = status === "REQUIRES_ACTION";
    return {
      actionExpiresAt: requiresAction ? new Date("2027-07-20T14:00:00.123Z") : null,
      actionReference: requiresAction ? `${PAYMENTS_GATE5C_MARKER}-action` : null,
      attemptNumber,
      createdAt: at(30 + index),
      finishedAt: ["FAILED", "CAPTURED"].includes(status) ? at(31 + index) : null,
      id: attemptId,
      idempotencyKey: id(2251 + index),
      paymentIntentId: intentIds[intentIndex]!,
      provider: "DETERMINISTIC_TEST",
      providerPaymentReference: providerReference(intentIndex),
      providerRequestReference: `${PAYMENTS_GATE5C_MARKER}-request-${index + 1}`,
      requiresAction,
      safeProviderCode: status === "FAILED" ? "PAYMENT_DECLINED" : null,
      startedAt: at(30 + index),
      status,
      updatedAt: at(31 + index),
    } as Prisma.PaymentAttemptCreateManyInput;
  });
}

function mutation(index: number, action: Prisma.PaymentMutationCreateManyInput["action"], actorType: Prisma.PaymentMutationCreateManyInput["actorType"], actorKey: string, actorPersonId: string | null, paymentIntentId: string, targetId: string, targetType: Prisma.PaymentMutationCreateManyInput["targetType"]): Prisma.PaymentMutationCreateManyInput {
  return { action, actorKey, actorPersonId, actorType, createdAt: at(60 + index), id: mutationIds[index]!, idempotencyKey: id(2551 + index), organizationId: organizationIds[0]!, paymentIntentId, requestHash: hash(`mutation-${index}`), result: { fixture: PAYMENTS_GATE5C_MARKER, safe: true }, resultVersion: 1, status: "COMPLETED", targetId, targetType, updatedAt: at(60 + index) };
}

function journalDefinitions(): Prisma.FinancialJournalCreateManyInput[] {
  const definitions = [
    { amount: "13000.000", intent: 3, sourceId: attemptIds[4]!, sourceType: "CAPTURE" as const },
    { amount: "14000.000", intent: 4, sourceId: attemptIds[5]!, sourceType: "CAPTURE" as const },
    { amount: "5000.000", intent: 4, refund: 0, sourceId: refundIds[0]!, sourceType: "REFUND" as const },
    { amount: "15000.000", intent: 5, sourceId: attemptIds[6]!, sourceType: "CAPTURE" as const },
    { amount: "15000.000", intent: 5, refund: 1, sourceId: refundIds[1]!, sourceType: "REFUND" as const },
    { amount: "18000.000", intent: 9, sourceId: attemptIds[10]!, sourceType: "CAPTURE" as const },
    { amount: "18000.000", intent: 8, sourceId: eventIds[2]!, sourceType: "CAPTURE" as const },
  ];
  return definitions.map((entry, index) => ({
    createdAt: at(70 + index),
    currency: "IQD",
    id: journalIds[index]!,
    idempotencyKey: `${PAYMENTS_GATE5C_MARKER}-journal-${index + 1}`,
    paymentIntentId: intentIds[entry.intent]!,
    paymentRefundId: entry.refund === undefined ? null : refundIds[entry.refund]!,
    sourceId: entry.sourceId,
    sourceType: entry.sourceType,
    status: "DRAFT",
  }));
}

async function ensureFixtureFinancialAccounts(transaction: Prisma.TransactionClient) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended('rezno:payments:gate5c:platform-accounts', 0)
    )::text AS locked
  `;
  const platformDefinitions = [
    { family: "PLATFORM_REVENUE" as const, id: accountIds.platform, key: "platform" as const },
    { family: "PROVIDER_CLEARING" as const, id: accountIds.provider, key: "provider" as const },
    { family: "CUSTOMER_REFUND_CLEARING" as const, id: accountIds.refund, key: "refund" as const },
  ];
  const existing = await transaction.financialAccount.findMany({
    where: {
      currency: "IQD",
      family: { in: platformDefinitions.map((definition) => definition.family) },
      organizationId: null,
    },
    select: { family: true, id: true },
  });
  const existingByFamily = new Map(existing.map((account) => [account.family, account.id]));
  await transaction.financialAccount.createMany({
    data: [
      {
        createdAt: baseTime,
        currency: "IQD",
        family: "MERCHANT_PAYABLE",
        id: accountIds.merchant,
        organizationId: organizationIds[0]!,
      },
      ...platformDefinitions
        .filter((definition) => !existingByFamily.has(definition.family))
        .map((definition) => ({
          createdAt: baseTime,
          currency: "IQD",
          family: definition.family,
          id: definition.id,
        })),
    ],
  });
  return platformDefinitions.reduce<Record<keyof typeof accountIds, string>>(
    (resolved, definition) => {
      resolved[definition.key] =
        existingByFamily.get(definition.family) ?? definition.id;
      return resolved;
    },
    { merchant: accountIds.merchant, platform: "", provider: "", refund: "" },
  );
}

function postingDefinitions(
  resolvedAccountIds: Record<keyof typeof accountIds, string>,
): Prisma.FinancialPostingCreateManyInput[] {
  const amounts = ["13000.000", "14000.000", "5000.000", "15000.000", "15000.000", "18000.000", "18000.000"];
  return journalIds.flatMap((journalId, index) => {
    const refund = index === 2 || index === 4;
    return [
      { accountId: refund ? resolvedAccountIds.merchant : resolvedAccountIds.provider, amount: amounts[index]!, createdAt: at(70 + index), id: postingIds[index * 2]!, journalId, side: "DEBIT" as const },
      { accountId: refund ? resolvedAccountIds.refund : resolvedAccountIds.merchant, amount: amounts[index]!, createdAt: at(70 + index), id: postingIds[index * 2 + 1]!, journalId, side: "CREDIT" as const },
    ];
  });
}

function settlementLine(index: number, journalId: string, captureGross: string, refunds: string, merchantNet: string): Prisma.SettlementLineCreateManyInput {
  return { captureGross, commission: "0.000", createdAt: at(90 + index), currency: "IQD", id: settlementLineIds[index]!, journalId, merchantNet, organizationId: organizationIds[0]!, refunds, settlementBatchId: settlementBatchIds[0]! };
}
