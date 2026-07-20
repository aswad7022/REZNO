import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PaymentDomainError } from "../../../features/payments/domain/errors";
import { assertJournalBalanced, reverseFinancialJournal } from "../../../features/payments/services/ledger";
import {
  cancelCustomerPaymentIntent,
  createCustomerPaymentIntent,
  getCustomerPaymentIntent,
  submitCustomerPaymentIntent,
} from "../../../features/payments/services/payment-intents";
import { processPaymentProviderWebhook } from "../../../features/payments/services/provider-events";
import { getBusinessPayment, listBusinessPayments } from "../../../features/payments/services/queries";
import { requestBusinessRefund, retryBusinessRefund } from "../../../features/payments/services/refunds";
import { runPaymentReconciliation } from "../../../features/payments/services/reconciliation";
import { finalizeSettlement, previewSettlement } from "../../../features/payments/services/settlements";
import { DeterministicPaymentProvider } from "../../../features/payments/providers/deterministic";
import { setPaymentProviderForTests } from "../../../features/payments/providers/registry";
import { setPaymentCursorSigningSecretForTests } from "../../../features/payments/domain/cursor-signing";
import { prisma } from "../../../lib/db/prisma";
import { createPayableBooking, createPayableOrder, createPaymentFixture } from "../helpers/payment-fixture";

test("Gate 5C payment lifecycle is authorized, exact-once, balanced, refundable, reconcilable, and settleable", { concurrency: false }, async (t) => {
  const fixture = await createPaymentFixture();
  const provider = new DeterministicPaymentProvider("gate5c-integration-webhook-secret-123");
  setPaymentProviderForTests(provider);
  setPaymentCursorSigningSecretForTests("gate5c-integration-cursor-secret-with-entropy-123456789");
  t.after(async () => {
    setPaymentProviderForTests(null);
    setPaymentCursorSigningSecretForTests(undefined);
    await prisma.$disconnect();
  });

  let capturedIntentId = "";
  let lateIntentId = "";

  await t.test("Customer Order intent derives exact server money, captures once, maps target, and replays", async () => {
    const order = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id, total: "12000.000" });
    const key = randomUUID();
    const payment = await createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: key, targetId: order.id, targetType: "ORDER" });
    capturedIntentId = payment.id;
    assert.equal(payment.amount, "12000.000");
    assert.equal(payment.currency, "IQD");
    assert.equal(payment.status, "CAPTURED");
    assert.equal(payment.capturedAmount, "12000.000");
    const replay = await createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: key, targetId: order.id, targetType: "ORDER" });
    assert.equal(replay.id, payment.id);
    assert.equal(await prisma.paymentAttempt.count({ where: { paymentIntentId: payment.id } }), 1);
    assert.equal(await prisma.financialJournal.count({ where: { paymentIntentId: payment.id, sourceType: "CAPTURE" } }), 1);
    const projected = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    assert.equal(projected.paymentStatus, "PAID");
    assert.equal(projected.payment?.status, "PAID");
    assert.equal(projected.payment?.paymentIntentId, payment.id);
    const journal = await prisma.financialJournal.findFirstOrThrow({ where: { paymentIntentId: payment.id, sourceType: "CAPTURE" }, include: { postings: true } });
    assertJournalBalanced(journal);
    assert.equal(journal.postings.reduce((sum, posting) => posting.side === "DEBIT" ? sum.plus(posting.amount) : sum, journal.postings[0]!.amount.minus(journal.postings[0]!.amount)).toFixed(3), "12000.000");
    assert.equal((await prisma.paymentIntent.findUniqueOrThrow({ where: { id: payment.id } })).commissionBasisPoints, 0);
    assert.equal((await prisma.paymentIntent.findUniqueOrThrow({ where: { id: payment.id } })).merchantNetAmount.toFixed(3), "12000.000");
    assert.equal(await prisma.notification.count({ where: { sourceId: payment.id, eventType: "payment.captured" } }) > 0, true);
    await assert.rejects(createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: key, targetId: (await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id })).id, targetType: "ORDER" }), code("IDEMPOTENCY_CONFLICT"));
    await assert.rejects(getCustomerPaymentIntent(fixture.actors.foreignCustomer.personId, payment.id), code("NOT_FOUND"));
  });

  await t.test("Booking intent is canonical and concurrent active intent creation has one winner", async () => {
    const booking = await createPayableBooking({ branchId: fixture.branch.id, customerId: fixture.customer.person.id, organizationId: fixture.organization.id });
    const payment = await createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: randomUUID(), targetId: booking.id, targetType: "BOOKING" });
    assert.equal(payment.status, "CAPTURED");
    const projected = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.equal(projected.paymentStatus, "PAID");
    assert.equal(projected.paymentMethod, "ONLINE_PROVIDER");

    provider.configureDefaultScenario("REQUIRES_ACTION");
    const concurrentOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id });
    const results = await Promise.allSettled([
      createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: randomUUID(), targetId: concurrentOrder.id, targetType: "ORDER" }),
      createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: randomUUID(), targetId: concurrentOrder.id, targetType: "ORDER" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.paymentIntent.count({ where: { orderId: concurrentOrder.id } }), 1);
    provider.configureDefaultScenario("IMMEDIATE_CAPTURE");
  });

  await t.test("attempt claims prevent concurrent submission and an expired owner is recoverable", async () => {
    const order = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id });
    const idempotencyKey = randomUUID();
    const originalCreate = provider.createPayment.bind(provider);
    let providerCalls = 0;
    provider.createPayment = async (input) => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return originalCreate(input);
    };
    const [first, replay] = await Promise.all([
      createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey, targetId: order.id, targetType: "ORDER" }),
      createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey, targetId: order.id, targetType: "ORDER" }),
    ]);
    provider.createPayment = originalCreate;
    assert.equal(first.id, replay.id);
    assert.equal(providerCalls, 1);
    assert.equal(await prisma.paymentAttempt.count({ where: { paymentIntentId: first.id } }), 1);

    provider.configureDefaultScenario("REQUIRES_ACTION");
    const recoverableOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id });
    const recoverableKey = randomUUID();
    const pending = await createCustomerPaymentIntent(fixture.customer.person.id, {
      idempotencyKey: recoverableKey,
      targetId: recoverableOrder.id,
      targetType: "ORDER",
    });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { paymentIntentId: pending.id } });
    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          actionExpiresAt: null,
          actionReference: null,
          claimedBy: "expired-worker",
          claimExpiresAt: new Date(Date.now() - 1_000),
          finishedAt: null,
          requiresAction: false,
          status: "PROCESSING",
        },
      }),
      prisma.paymentIntent.update({ where: { id: pending.id }, data: { status: "PROCESSING" } }),
    ]);
    const recovered = await submitCustomerPaymentIntent(fixture.customer.person.id, pending.id, recoverableKey);
    assert.equal(recovered.status, "REQUIRES_ACTION");
    assert.equal(await prisma.paymentAttempt.count({ where: { paymentIntentId: pending.id } }), 1);
    const recoveredAttempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    assert.equal(recoveredAttempt.claimedBy, null);
    assert.equal(recoveredAttempt.claimExpiresAt, null);
    provider.configureDefaultScenario("IMMEDIATE_CAPTURE");
  });

  await t.test("Owner and Manager are scoped; Receptionist, Staff, revoked, and foreign Organization are denied", async () => {
    assert.equal((await getBusinessPayment(fixture.ownerReference, capturedIntentId)).id, capturedIntentId);
    assert.equal((await getBusinessPayment(fixture.managerReference, capturedIntentId)).id, capturedIntentId);
    await assert.rejects(getBusinessPayment(fixture.receptionistReference, capturedIntentId), hasAuthorizationFailure);
    await assert.rejects(getBusinessPayment(fixture.staffReference, capturedIntentId), hasAuthorizationFailure);
    await assert.rejects(getBusinessPayment(fixture.revokedReference, capturedIntentId), hasAuthorizationFailure);
    await assert.rejects(getBusinessPayment({ contextOrganizationId: fixture.foreignOrganization.id, membershipId: fixture.ownerReference.membershipId, personId: fixture.ownerReference.personId }, capturedIntentId), hasAuthorizationFailure);
  });

  await t.test("partial and full refunds are exact-once, balanced, and cannot over-refund concurrently", async () => {
    let current = await getBusinessPayment(fixture.ownerReference, capturedIntentId);
    const firstKey = randomUUID();
    const firstRefundInput = {
      amount: "2000.000",
      expectedVersion: current.version,
      idempotencyKey: firstKey,
      paymentIntentId: current.id,
      reasonCode: "CUSTOMER_REQUEST" as const,
    };
    const originalRefund = provider.refundPayment.bind(provider);
    let refundProviderCalls = 0;
    provider.refundPayment = async (input) => {
      refundProviderCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return originalRefund(input);
    };
    await Promise.all([
      requestBusinessRefund(fixture.ownerReference, firstRefundInput),
      requestBusinessRefund(fixture.ownerReference, firstRefundInput),
    ]);
    provider.refundPayment = originalRefund;
    assert.equal(refundProviderCalls, 1);
    assert.equal(await prisma.paymentRefund.count({ where: { paymentIntentId: current.id } }), 1);
    current = await getBusinessPayment(fixture.ownerReference, capturedIntentId);
    assert.equal(current.status, "PARTIALLY_REFUNDED");
    assert.equal(current.refundedAmount, "2000.000");
    const replay = await requestBusinessRefund(fixture.ownerReference, {
      amount: "2000.000",
      expectedVersion: current.version - 1,
      idempotencyKey: firstKey,
      paymentIntentId: current.id,
      reasonCode: "CUSTOMER_REQUEST",
    });
    assert.equal(replay.refundedAmount, "2000.000");
    const refundJournal = await prisma.financialJournal.findFirstOrThrow({ where: { paymentIntentId: current.id, sourceType: "REFUND" }, include: { postings: true } });
    assertJournalBalanced(refundJournal);

    const overRefundOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id, total: "10000.000" });
    const overRefundPayment = await createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: randomUUID(), targetId: overRefundOrder.id, targetType: "ORDER" });
    const refundResults = await Promise.allSettled([
      requestBusinessRefund(fixture.ownerReference, { amount: "7000.000", expectedVersion: overRefundPayment.version, idempotencyKey: randomUUID(), paymentIntentId: overRefundPayment.id, reasonCode: "CUSTOMER_REQUEST" }),
      requestBusinessRefund(fixture.managerReference, { amount: "7000.000", expectedVersion: overRefundPayment.version, idempotencyKey: randomUUID(), paymentIntentId: overRefundPayment.id, reasonCode: "CUSTOMER_REQUEST" }),
    ]);
    assert.equal(refundResults.filter((result) => result.status === "fulfilled").length, 1);
    const overRefundStored = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: overRefundPayment.id } });
    assert.equal(overRefundStored.refundedAmount.toFixed(3), "7000.000");

    const retryOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id, total: "5000.000" });
    const retryPayment = await createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: randomUUID(), targetId: retryOrder.id, targetType: "ORDER" });
    const deterministicRefund = provider.refundPayment.bind(provider);
    provider.refundPayment = async () => ({ outcome: "TRANSIENT_FAILURE", safeCode: "TEMPORARY_UNAVAILABLE" });
    await requestBusinessRefund(fixture.ownerReference, {
      amount: "1000.000",
      expectedVersion: retryPayment.version,
      idempotencyKey: randomUUID(),
      paymentIntentId: retryPayment.id,
      reasonCode: "SERVICE_UNAVAILABLE",
    });
    provider.refundPayment = deterministicRefund;
    const failedRefund = await prisma.paymentRefund.findFirstOrThrow({ where: { paymentIntentId: retryPayment.id } });
    assert.equal(failedRefund.status, "FAILED");
    const retried = await retryBusinessRefund(fixture.ownerReference, failedRefund.id, {
      expectedVersion: failedRefund.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(retried.refundedAmount, "1000.000");
    assert.equal((await prisma.paymentRefund.findUniqueOrThrow({ where: { id: failedRefund.id } })).status, "SUCCEEDED");

    current = await requestBusinessRefund(fixture.ownerReference, {
      amount: "10000.000",
      expectedVersion: current.version,
      idempotencyKey: randomUUID(),
      paymentIntentId: current.id,
      reasonCode: "CUSTOMER_REQUEST",
    });
    assert.equal(current.status, "REFUNDED");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: current.target.id } })).paymentStatus, "REFUNDED");
  });

  await t.test("signed webhook is replay-safe, out-of-order aware, and late capture remains an exception", async () => {
    provider.configureDefaultScenario("REQUIRES_ACTION");
    const lateOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id, total: "9000.000" });
    const pending = await createCustomerPaymentIntent(fixture.customer.person.id, { idempotencyKey: randomUUID(), targetId: lateOrder.id, targetType: "ORDER" });
    lateIntentId = pending.id;
    assert.equal(pending.status, "REQUIRES_ACTION");
    const cancelled = await cancelCustomerPaymentIntent(fixture.customer.person.id, pending.id, { expectedVersion: pending.version, idempotencyKey: randomUUID() });
    assert.equal(cancelled.status, "CANCELLED");
    const stored = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: pending.id } });
    const now = new Date();
    const capturedEvent = provider.signWebhook({ amount: "9000.000", currency: "IQD", eventId: "late-capture-" + randomUUID(), occurredAt: now, outcome: "CAPTURED", providerReference: stored.providerReference!, safeCode: null }, now);
    const first = await processPaymentProviderWebhook({ ...capturedEvent, receivedAt: now });
    const duplicate = await processPaymentProviderWebhook({ ...capturedEvent, receivedAt: now });
    assert.equal(first.status, "PROCESSED");
    assert.equal(duplicate.duplicate, true);
    const collidedEvent = provider.signWebhook({ amount: "8000.000", currency: "IQD", eventId: JSON.parse(Buffer.from(capturedEvent.body).toString("utf8")).eventId, occurredAt: now, outcome: "CAPTURED", providerReference: stored.providerReference!, safeCode: null }, now);
    await assert.rejects(processPaymentProviderWebhook({ ...collidedEvent, receivedAt: now }), code("IDEMPOTENCY_CONFLICT"));
    const late = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(late.status, "CANCELLED");
    assert.equal(late.capturedAmount.toFixed(3), "9000.000");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: lateOrder.id } })).paymentStatus, "VOIDED");
    const oldAuthorized = provider.signWebhook({ amount: null, currency: null, eventId: "old-authorized-" + randomUUID(), occurredAt: new Date(now.getTime() - 60_000), outcome: "AUTHORIZED", providerReference: stored.providerReference!, safeCode: null }, now);
    assert.equal((await processPaymentProviderWebhook({ ...oldAuthorized, receivedAt: now })).status, "IGNORED");
    await assert.rejects(processPaymentProviderWebhook({ ...capturedEvent, signature: "0".repeat(64), receivedAt: now }), code("WEBHOOK_INVALID_SIGNATURE"));
    assert.equal(await prisma.notification.count({ where: { sourceId: pending.id, eventType: "payment.captured" } }) > 0, true);
    provider.configureDefaultScenario("IMMEDIATE_CAPTURE");
  });

  await t.test("authenticated cursors reject cross-scope replay", async () => {
    const first = await listBusinessPayments(fixture.ownerReference, { limit: 1 });
    assert.ok(first.nextCursor);
    await assert.rejects(listBusinessPayments(fixture.managerReference, { cursor: first.nextCursor!, limit: 1 }), code("INVALID_CURSOR"));
    await assert.rejects(listBusinessPayments(fixture.ownerReference, { cursor: first.nextCursor!, limit: 2 }), code("INVALID_CURSOR"));
  });

  await t.test("posted ledger history is immutable and reversals are exact linked opposites", async () => {
    const reversibleOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id, total: "6000.000" });
    const reversiblePayment = await createCustomerPaymentIntent(fixture.customer.person.id, {
      idempotencyKey: randomUUID(),
      targetId: reversibleOrder.id,
      targetType: "ORDER",
    });
    const original = await prisma.financialJournal.findFirstOrThrow({
      where: { paymentIntentId: reversiblePayment.id, sourceType: "CAPTURE" },
      include: { postings: true },
    });
    const reversal = await prisma.$transaction((transaction) =>
      reverseFinancialJournal(transaction, original.id, "reversal:" + randomUUID(), new Date()),
    );
    assert.equal((await prisma.financialJournal.findUniqueOrThrow({ where: { id: original.id } })).status, "REVERSED");
    assert.equal(reversal.status, "POSTED");
    assert.equal(reversal.reversalOfJournalId, original.id);
    for (const posting of original.postings) {
      const opposite = reversal.postings.find((candidate) => candidate.accountId === posting.accountId);
      assert.ok(opposite);
      assert.equal(opposite.amount.toFixed(3), posting.amount.toFixed(3));
      assert.notEqual(opposite.side, posting.side);
    }
    await assert.rejects(prisma.financialJournal.delete({ where: { id: original.id } }));

    const invalidOrder = await createPayableOrder({ customerId: fixture.customer.person.id, storeId: fixture.store.id, total: "7000.000" });
    const invalidPayment = await createCustomerPaymentIntent(fixture.customer.person.id, {
      idempotencyKey: randomUUID(),
      targetId: invalidOrder.id,
      targetType: "ORDER",
    });
    const invalidOriginal = await prisma.financialJournal.findFirstOrThrow({
      where: { paymentIntentId: invalidPayment.id, sourceType: "CAPTURE" },
      include: { postings: true },
    });
    await assert.rejects(prisma.financialJournal.update({ where: { id: invalidOriginal.id }, data: { status: "REVERSED" } }));
    const invalidReversalId = randomUUID();
    await assert.rejects(prisma.$transaction(async (transaction) => {
      const draft = await transaction.financialJournal.create({
        data: {
          currency: invalidOriginal.currency,
          id: invalidReversalId,
          idempotencyKey: "invalid-reversal:" + randomUUID(),
          paymentIntentId: invalidOriginal.paymentIntentId,
          reversalOfJournalId: invalidOriginal.id,
          sourceId: invalidOriginal.id,
          sourceType: "REVERSAL",
          postings: {
            create: invalidOriginal.postings.map((posting) => ({
              accountId: posting.accountId,
              amount: "1.000",
              id: randomUUID(),
              side: posting.side === "DEBIT" ? "CREDIT" : "DEBIT",
            })),
          },
        },
      });
      await transaction.financialJournal.update({ where: { id: draft.id }, data: { postedAt: new Date(), status: "POSTED" } });
    }));
    assert.equal(await prisma.financialJournal.count({ where: { id: invalidReversalId } }), 0);
  });

  await t.test("settlement is ledger-derived, finalizable once, immutable, and not represented as payout", async () => {
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const firstDraft = await previewSettlement(fixture.adminContext, { currency: "IQD", idempotencyKey: randomUUID(), organizationId: fixture.organization.id, periodEnd, periodStart });
    const competingDraft = await previewSettlement(fixture.adminContext, { currency: "IQD", idempotencyKey: randomUUID(), organizationId: fixture.organization.id, periodEnd, periodStart });
    assert.equal(firstDraft.status, "DRAFT");
    assert.ok(firstDraft.lines.length > 0);
    assert.equal(firstDraft.meaning, "LEDGER_STATEMENT_NOT_BANK_PAYOUT");
    const finalizations = await Promise.allSettled([
      finalizeSettlement(fixture.adminContext, firstDraft.id, { expectedVersion: firstDraft.version, idempotencyKey: randomUUID() }),
      finalizeSettlement(fixture.adminContext, competingDraft.id, { expectedVersion: competingDraft.version, idempotencyKey: randomUUID() }),
    ]);
    assert.equal(finalizations.filter((result) => result.status === "fulfilled").length, 1);
    const finalizedResult = finalizations.find((result) => result.status === "fulfilled");
    assert.ok(finalizedResult?.status === "fulfilled");
    const finalized = finalizedResult.value;
    assert.equal(finalized.status, "FINALIZED");
    await assert.rejects(prisma.settlementBatch.update({ where: { id: finalized.id }, data: { merchantNet: "1.000" } }));
    await assert.rejects(prisma.financialJournal.update({ where: { id: finalized.lines[0]!.journalId }, data: { sourceId: randomUUID() } }));
    const posting = await prisma.financialPosting.findFirstOrThrow({ where: { journalId: finalized.lines[0]!.journalId } });
    await assert.rejects(prisma.financialPosting.delete({ where: { id: posting.id } }));
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "payments.settlement.finalize", targetId: finalized.id } }), 1);
  });

  await t.test("bounded reconciliation reports the cancelled-target late capture without rewriting history", async () => {
    const before = await prisma.financialJournal.count({ where: { paymentIntentId: lateIntentId } });
    const result = await runPaymentReconciliation(fixture.adminContext, { idempotencyKey: randomUUID(), limit: 1, paymentIntentId: lateIntentId });
    assert.equal(result.checked, 1);
    assert.equal(result.items[0]?.classification, "TARGET_STATE_MISMATCH");
    assert.equal(await prisma.financialJournal.count({ where: { paymentIntentId: lateIntentId } }), before);
    await prisma.adminAccess.update({ where: { id: fixture.adminAccess.id }, data: { status: "REVOKED" } });
    await assert.rejects(runPaymentReconciliation(fixture.adminContext, { idempotencyKey: randomUUID(), paymentIntentId: lateIntentId }), hasAuthorizationFailure);
  });
});

function code(expected: string) {
  return (error: unknown) => error instanceof PaymentDomainError && error.code === expected;
}

function hasAuthorizationFailure(error: unknown) {
  return error instanceof Error && "code" in error && ["FORBIDDEN", "MEMBERSHIP_UNAVAILABLE", "UNAUTHORIZED"].includes(String((error as { code: unknown }).code));
}
