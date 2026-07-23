import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { CommerceAdminContext, MerchantActorReference } from "../../features/commerce/services/authorization";
import { PAYMENT_WEBHOOK_MAXIMUM_BYTES, readBoundedPaymentWebhookBody } from "../../features/payments/api/validation";
import { PaymentDomainError } from "../../features/payments/domain/errors";
import { DeterministicPaymentProvider } from "../../features/payments/providers/deterministic";
import { paymentProvider } from "../../features/payments/providers/registry";
import { getCustomerPaymentCapabilities } from "../../features/payments/services/capabilities";
import { listBusinessJournals } from "../../features/payments/services/journal-queries";
import { getCustomerPaymentIntent } from "../../features/payments/services/payment-intents";
import { runPaymentReconciliation } from "../../features/payments/services/reconciliation";
import { getBusinessPayment, getAdminPayment, listAdminPayments, listBusinessPayments, listBusinessRefunds, listCustomerPayments } from "../../features/payments/services/queries";
import { listAdminSettlements } from "../../features/payments/services/settlements";
import { prisma } from "../../lib/db/prisma";
import {
  inspectPaymentsGate5cSuccessorEvidence,
  materializePaymentsGate5cEvidence,
  PAYMENTS_GATE5C_MARKER,
  paymentsGate5cFixtureIds,
} from "./payments-gate5c-fixture";
import { assertPaymentsGate5cStaging } from "./payments-gate5c-safety";

let smokePhase = "BOOT";

async function main() {
  const gate6cSuccessor =
    process.env.REZNO_STAGE6_GATE6C_SUCCESSOR === "true"
    && process.env.REZNO_STAGE6_GATE6C_CONFIRM
      === "REZNO_STAGE6_GATE6C_STAGING_ONLY";
  smokePhase = "SAFETY";
  const safety = await assertPaymentsGate5cStaging(prisma);
  const ids = paymentsGate5cFixtureIds;
  assert.equal(paymentProvider().kind, "NOT_CONFIGURED");

  const customerA = ids.personIds[0]!;
  const customerB = ids.personIds[1]!;
  const owner = merchant(0, 2);
  const manager = merchant(1, 3);
  const receptionist = merchant(2, 4);
  const staff = merchant(3, 5);
  const revoked = merchant(4, 6);
  const foreignOwner = merchant(5, 7, 1);
  const admin = adminContext(0, 8, ["PAYMENTS_VIEW", "PAYMENTS_REFUND", "PAYMENTS_RECONCILE", "SETTLEMENTS_VIEW", "SETTLEMENTS_MANAGE"]);
  const revokedAdmin = adminContext(4, 12, ["PAYMENTS_VIEW", "PAYMENTS_REFUND", "PAYMENTS_RECONCILE", "SETTLEMENTS_VIEW", "SETTLEMENTS_MANAGE"]);

  const capabilities = await getCustomerPaymentCapabilities(customerA, { targetId: ids.orderIds[0]!, targetType: "ORDER" });
  assert.equal(capabilities.providerConfigured, false);
  assert.equal(capabilities.onlinePaymentsAvailable, false);
  assert.deepEqual(capabilities.offlineMethods, ["CASH_ON_DELIVERY", "PAY_AT_PICKUP"]);

  const ownPayment = await getCustomerPaymentIntent(customerA, ids.intentIds[3]!);
  assert.equal(ownPayment.amount, "13000.000");
  assert.equal(ownPayment.currency, "IQD");
  await assert.rejects(getCustomerPaymentIntent(customerB, ids.intentIds[3]!), notFound);

  assert.equal((await getBusinessPayment(owner, ids.intentIds[3]!)).id, ids.intentIds[3]);
  assert.equal((await getBusinessPayment(manager, ids.intentIds[3]!)).id, ids.intentIds[3]);
  await assert.rejects(getBusinessPayment(receptionist, ids.intentIds[3]!), denied);
  await assert.rejects(getBusinessPayment(staff, ids.intentIds[3]!), denied);
  await assert.rejects(getBusinessPayment(revoked, ids.intentIds[3]!), denied);
  await assert.rejects(getBusinessPayment(foreignOwner, ids.intentIds[3]!), notFound);
  assert.equal((await getAdminPayment(admin, ids.intentIds[3]!)).id, ids.intentIds[3]);
  await assert.rejects(getAdminPayment(revokedAdmin, ids.intentIds[3]!), denied);

  smokePhase = "LIFECYCLE_MATRIX";
  const lifecycleMatrix = await assertFixtureLifecycleMatrix();

  smokePhase = "PAGINATION_AND_AUTHORIZATION";
  const customerPage = await listCustomerPayments(customerA, { limit: 1 });
  const ownerPage = await listBusinessPayments(owner, { limit: 1 });
  const managerPage = await listBusinessPayments(manager, { limit: 1 });
  const adminPage = await listAdminPayments(admin, { limit: 1, organizationId: ids.organizationIds[0] });
  assert.ok(customerPage.nextCursor);
  assert.ok(ownerPage.nextCursor);
  assert.ok(managerPage.nextCursor);
  assert.ok(adminPage.nextCursor);
  await assert.rejects(listBusinessPayments(manager, { cursor: ownerPage.nextCursor!, limit: 1 }), invalidCursor);
  await assert.rejects(listBusinessPayments(owner, { cursor: ownerPage.nextCursor!, limit: 2 }), invalidCursor);

  const refunds = await listBusinessRefunds(owner, { limit: 1 });
  const journals = await listBusinessJournals(owner, { limit: 1 });
  const settlements = await listAdminSettlements(admin, { limit: 1, organizationId: ids.organizationIds[0] });
  assert.ok(refunds.nextCursor);
  assert.ok(journals.nextCursor);
  assert.ok(settlements.nextCursor);
  assert.equal(refunds.items[0]?.amount.includes("."), true);
  assert.equal(journals.items[0]?.balanced, true);
  assert.equal(settlements.items[0]?.meaning, "LEDGER_STATEMENT_NOT_BANK_PAYOUT");

  smokePhase = "RECONCILIATION";
  const reconciliation = await runPaymentReconciliation(admin, {
    idempotencyKey: ids.mutationIds[0]!,
    limit: 1,
    paymentIntentId: ids.intentIds[0]!,
  });
  assert.equal(reconciliation.checked, 1);
  assert.equal(reconciliation.items[0]?.classification, "NOT_CONFIGURED");
  assert.equal(reconciliation.items[0]?.providerStatus, "NOT_CONFIGURED");

  smokePhase = "DETERMINISTIC_PROVIDER";
  const provider = new DeterministicPaymentProvider("gate5c-staging-operator-secret", () => new Date("2026-07-20T15:00:00.000Z"));
  const scenarios = ["IMMEDIATE_CAPTURE", "REQUIRES_ACTION", "AUTHORIZE", "TRANSIENT_FAILURE", "PERMANENT_FAILURE"] as const;
  const outcomes: string[] = [];
  for (const [index, scenario] of scenarios.entries()) {
    provider.configureDefaultScenario(scenario);
    const result = await provider.createPayment({
      amount: `${20000 + index * 1000}.000`,
      currency: "IQD",
      expiresAt: new Date("2026-07-20T16:00:00.000Z"),
      paymentIntentId: ids.intentIds[index]!,
      providerRequestReference: `${PAYMENTS_GATE5C_MARKER}-smoke-${index}`,
    });
    outcomes.push(result.outcome);
    const replay = await provider.createPayment({
      amount: `${20000 + index * 1000}.000`,
      currency: "IQD",
      expiresAt: new Date("2026-07-20T16:00:00.000Z"),
      paymentIntentId: ids.intentIds[index]!,
      providerRequestReference: `${PAYMENTS_GATE5C_MARKER}-smoke-${index}`,
    });
    assert.equal(replay.outcome, "DUPLICATE");
  }
  assert.deepEqual(outcomes, ["CAPTURED", "REQUIRES_ACTION", "AUTHORIZED", "TRANSIENT_FAILURE", "PERMANENT_FAILURE"]);
  const signedAt = new Date("2026-07-20T15:00:00.000Z");
  const signed = provider.signWebhook({
    amount: "20000.000",
    currency: "IQD",
    eventId: `${PAYMENTS_GATE5C_MARKER}-signed-event`,
    occurredAt: signedAt,
    outcome: "CAPTURED",
    providerReference: `${PAYMENTS_GATE5C_MARKER}-safe-reference`,
    safeCode: null,
  }, signedAt);
  assert.equal((await provider.verifyAndParseWebhook({ ...signed, receivedAt: signedAt })).outcome, "READY");
  assert.equal((await provider.verifyAndParseWebhook({ ...signed, signature: "0".repeat(64), receivedAt: signedAt })).outcome, "INVALID_SIGNATURE");
  const boundedWebhook = await assertBoundedWebhookIngestion();

  smokePhase = "FINANCIAL_EVIDENCE";
  const financial = gate6cSuccessor
    ? await inspectPaymentsGate5cSuccessorEvidence(prisma)
    : await materializePaymentsGate5cEvidence(prisma);
  if (gate6cSuccessor) {
    assert.deepEqual(financial.evidence, {
      balanced: true,
      baseSettlementSentinels: 2,
      journalCount: 7,
      meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT",
      postingCount: 14,
      readOnlySuccessorInspection: true,
      settlementLineCount: 0,
    });
  } else {
    assert.deepEqual(financial.evidence, {
      balanced: true,
      finalizedSettlement: true,
      journalCount: 7,
      journalImmutable: true,
      meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT",
      overRefundRejected: true,
      postingImmutable: true,
      settlementDoubleInclusionRejected: true,
      settlementImmutable: true,
    });
  }

  const leaked = JSON.stringify({ adminPage, capabilities, customerPage, financial, journals, lifecycleMatrix, ownerPage, reconciliation, refunds, settlements });
  assert.doesNotMatch(leaked, /postgresql:\/\/|DATABASE_URL|BETTER_AUTH_SECRET|webhookSecret|authorization|cardNumber|\bcvv\b|\bpan\b|provider access token/i);
  const duplicatedNotifications = await prisma.notification.groupBy({
    by: ["eventType", "sourceId"],
    where: { sourceId: { in: [...ids.intentIds, ...ids.refundIds, ...ids.settlementBatchIds] } },
    _count: true,
    having: { id: { _count: { gt: 1 } } },
  });
  assert.equal(duplicatedNotifications.length, 0);

  smokePhase = "OUTPUT";
  console.log(JSON.stringify({
    ...safety,
    boundedWebhook,
    capabilities: "NOT_CONFIGURED",
    cursorIsolation: "scope-and-page-size-bound",
    deterministicOutcomes: outcomes,
    financial,
    fixture: PAYMENTS_GATE5C_MARKER,
    lifecycleMatrix,
    pagination: { admin: adminPage.items.length, customer: customerPage.items.length, journals: journals.items.length, merchant: ownerPage.items.length, refunds: refunds.items.length, settlements: settlements.items.length },
    reconciliation: reconciliation.items[0]?.classification,
    status: "passed",
  }));
}

async function assertBoundedWebhookIngestion() {
  const legalBody = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const legal = streamingRequest([legalBody.subarray(0, 2), legalBody.subarray(2)]);
  assert.deepEqual(await readBoundedPaymentWebhookBody(legal.request, PAYMENT_WEBHOOK_MAXIMUM_BYTES), legalBody);

  const overflow = streamingRequest(
    [new Uint8Array(PAYMENT_WEBHOOK_MAXIMUM_BYTES), new Uint8Array(1), new Uint8Array(1)],
    { "content-length": "1" },
  );
  await assert.rejects(
    readBoundedPaymentWebhookBody(overflow.request, PAYMENT_WEBHOOK_MAXIMUM_BYTES),
    (error) => error instanceof PaymentDomainError && error.code === "VALIDATION_ERROR",
  );
  assert.equal(overflow.probe.cancelCount, 1);
  assert.equal(overflow.probe.pullCount, 2);
  return {
    actualByteLimit: PAYMENT_WEBHOOK_MAXIMUM_BYTES,
    falseSmallerContentLengthRejected: true,
    overflowCancelled: true,
    rawByteOrderPreserved: true,
  } as const;
}

function streamingRequest(chunks: readonly Uint8Array[], headers: HeadersInit = {}) {
  const probe = { cancelCount: 0, pullCount: 0 };
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      probe.cancelCount += 1;
    },
    pull(controller) {
      probe.pullCount += 1;
      const chunk = chunks[index++];
      if (!chunk) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
  }, { highWaterMark: 0 });
  const request = new Request("https://rezno.invalid/payment-webhook", {
    body,
    duplex: "half",
    headers,
    method: "POST",
  } as RequestInit & { duplex: "half" });
  return { probe, request };
}

async function assertFixtureLifecycleMatrix() {
  const ids = paymentsGate5cFixtureIds;
  const intents = await prisma.paymentIntent.findMany({
    where: { id: { in: ids.intentIds } },
    include: {
      attempts: true,
      booking: { select: { currency: true, customerId: true, paymentStatus: true, priceSnapshot: true } },
      journals: { include: { postings: true } },
      order: { select: { currency: true, customerId: true, grandTotal: true, paymentStatus: true } },
      providerEvents: true,
      refunds: true,
    },
  });
  assert.equal(intents.length, 11);
  const byId = new Map(intents.map((intent) => [intent.id, intent]));
  const created = byId.get(ids.intentIds[0]!)!;
  const requiresAction = byId.get(ids.intentIds[1]!)!;
  const authorized = byId.get(ids.intentIds[2]!)!;
  const captured = byId.get(ids.intentIds[3]!)!;
  const partiallyRefunded = byId.get(ids.intentIds[4]!)!;
  const refunded = byId.get(ids.intentIds[5]!)!;
  const failed = byId.get(ids.intentIds[6]!)!;
  const lateCapture = byId.get(ids.intentIds[8]!)!;
  const capturedBooking = byId.get(ids.intentIds[9]!)!;

  assert.equal(created.customerPersonId, created.order?.customerId);
  assert.equal(created.amount.equals(created.order!.grandTotal), true);
  assert.equal(created.currency, created.order?.currency);
  assert.equal(requiresAction.status, "REQUIRES_ACTION");
  assert.equal(requiresAction.attempts.some((attempt) => attempt.status === "REQUIRES_ACTION" && attempt.requiresAction), true);
  assert.equal(authorized.status, "AUTHORIZED");
  assert.equal(captured.status, "CAPTURED");
  assert.equal(captured.order?.paymentStatus, "PAID");
  assert.equal(partiallyRefunded.status, "PARTIALLY_REFUNDED");
  assert.equal(partiallyRefunded.order?.paymentStatus, "PARTIALLY_REFUNDED");
  assert.equal(partiallyRefunded.refunds.some((refund) => refund.status === "SUCCEEDED" && refund.amount.equals("5000.000")), true);
  assert.equal(refunded.status, "REFUNDED");
  assert.equal(refunded.order?.paymentStatus, "REFUNDED");
  assert.equal(refunded.refunds.some((refund) => refund.status === "SUCCEEDED" && refund.amount.equals(refunded.capturedAmount)), true);
  assert.equal(failed.status, "FAILED");
  assert.equal(capturedBooking.booking?.paymentStatus, "PAID");
  assert.equal(capturedBooking.amount.equals(capturedBooking.booking!.priceSnapshot), true);
  assert.equal(capturedBooking.currency, capturedBooking.booking?.currency);
  assert.equal(lateCapture.status, "CANCELLED");
  assert.equal(lateCapture.capturedAmount.isPositive(), true);
  assert.equal(lateCapture.order?.paymentStatus, "VOIDED");
  assert.equal(lateCapture.providerEvents.some((event) => event.normalizedType === "CAPTURED" && event.status === "PROCESSED"), true);
  assert.equal(captured.providerEvents.some((event) => event.normalizedType === "AUTHORIZED" && event.status === "IGNORED"), true);
  assert.equal(captured.providerEvents.some((event) => event.normalizedType === "CAPTURED" && event.status === "PROCESSED"), true);

  const captureJournals = intents.flatMap((intent) => intent.journals).filter((journal) => journal.sourceType === "CAPTURE");
  const refundJournals = intents.flatMap((intent) => intent.journals).filter((journal) => journal.sourceType === "REFUND");
  assert.equal(captureJournals.length, 5);
  assert.equal(refundJournals.length, 2);
  for (const journal of [...captureJournals, ...refundJournals]) {
    const debit = journal.postings.filter((posting) => posting.side === "DEBIT").reduce((sum, posting) => sum.plus(posting.amount), journal.postings[0]!.amount.mul(0));
    const credit = journal.postings.filter((posting) => posting.side === "CREDIT").reduce((sum, posting) => sum.plus(posting.amount), journal.postings[0]!.amount.mul(0));
    assert.equal(debit.equals(credit), true);
  }
  for (const intent of intents.filter((intent) => intent.capturedAmount.isPositive())) {
    assert.equal(intent.commissionBasisPoints, 0);
    assert.equal(intent.commissionAmount.isZero(), true);
    assert.equal(intent.merchantNetAmount.equals(intent.capturedAmount), true);
  }

  const createMutation = await prisma.paymentMutation.findUniqueOrThrow({ where: { id: ids.mutationIds[0]! } });
  assert.equal(createMutation.action, "CREATE_INTENT");
  assert.equal(createMutation.actorPersonId, created.customerPersonId);
  assert.equal(createMutation.paymentIntentId, created.id);
  assert.equal(await prisma.paymentMutation.count({ where: { actorKey: createMutation.actorKey, idempotencyKey: createMutation.idempotencyKey } }), 1);
  await assert.rejects(prisma.paymentMutation.create({
    data: {
      action: createMutation.action,
      actorKey: createMutation.actorKey,
      actorPersonId: createMutation.actorPersonId,
      actorType: createMutation.actorType,
      id: randomUUID(),
      idempotencyKey: createMutation.idempotencyKey,
      organizationId: createMutation.organizationId,
      paymentIntentId: createMutation.paymentIntentId,
      requestHash: "0".repeat(64),
      result: { changedReplay: true },
      resultVersion: createMutation.resultVersion,
      status: createMutation.status,
      targetId: createMutation.targetId,
      targetType: createMutation.targetType,
    },
  }));
  const captureEvent = captured.providerEvents.find((event) => event.normalizedType === "CAPTURED")!;
  assert.equal(await prisma.paymentProviderEvent.count({ where: { provider: captureEvent.provider, providerEventId: captureEvent.providerEventId } }), 1);

  return {
    bookingStateMapping: true,
    captureAndRefundJournalsBalanced: true,
    captureExactOnceEvidence: true,
    changedReplayRejected: true,
    commissionZeroMerchantPayableExact: true,
    customerCreateReplayEvidence: true,
    duplicateWebhookEvidence: true,
    lateCaptureExceptionPreserved: true,
    orderStateMapping: true,
    outOfOrderWebhookIgnored: true,
    partialAndFullRefunds: true,
    serverAmountAndCurrency: true,
  } as const;
}

function merchant(memberIndex: number, personIndex: number, organizationIndex = 0): MerchantActorReference {
  const ids = paymentsGate5cFixtureIds;
  return { contextOrganizationId: ids.organizationIds[organizationIndex]!, membershipId: ids.memberIds[memberIndex]!, personId: ids.personIds[personIndex]! };
}

function adminContext(accessIndex: number, personIndex: number, permissions: CommerceAdminContext["permissions"]): CommerceAdminContext {
  const ids = paymentsGate5cFixtureIds;
  return { adminAccessId: ids.adminAccessIds[accessIndex]!, isSuperAdmin: false, personId: ids.personIds[personIndex]!, permissions, source: "database", userId: ids.userIds[personIndex]! };
}

function denied(error: unknown) {
  return error instanceof Error && "code" in error && ["FORBIDDEN", "MEMBERSHIP_UNAVAILABLE", "UNAUTHORIZED"].includes(String((error as { code: unknown }).code));
}

function notFound(error: unknown) {
  return error instanceof PaymentDomainError && error.code === "NOT_FOUND";
}

function invalidCursor(error: unknown) {
  return error instanceof PaymentDomainError && error.code === "INVALID_CURSOR";
}

main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 5C staging smoke failed closed at ${smokePhase}.`);
  })
  .finally(() => prisma.$disconnect());
