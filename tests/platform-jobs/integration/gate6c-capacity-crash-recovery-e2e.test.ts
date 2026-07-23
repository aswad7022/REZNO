import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CommunicationOperationRetryableError,
} from "../../../features/communications/domain/errors";
import {
  DeterministicSinkProvider,
  setCommunicationTestProviderFactory,
  type OutboundProvider,
} from "../../../features/communications/providers/provider";
import {
  createCampaign,
} from "../../../features/communications/services/campaigns";
import {
  processExactDeliveryForAutomation,
  sendCampaignNow,
  setDeliveryAutomationTestHook,
} from "../../../features/communications/services/dispatcher";
import {
  PaymentDomainError,
  PaymentOperationRetryableError,
} from "../../../features/payments/domain/errors";
import {
  DeterministicPaymentProvider,
} from "../../../features/payments/providers/deterministic";
import {
  setPaymentProviderForTests,
} from "../../../features/payments/providers/registry";
import {
  createCustomerPaymentIntent,
  retryPaymentAttemptFromAutomation,
  setPaymentAttemptRetryTestHook,
} from "../../../features/payments/services/payment-intents";
import {
  processPaymentProviderWebhook,
  processVerifiedPaymentProviderEvent,
  type PaymentExecutionGuard,
} from "../../../features/payments/services/provider-events";
import {
  requestBusinessRefund,
  retryAdminRefund,
  setRefundRetryTestHook,
} from "../../../features/payments/services/refunds";
import { prisma } from "../../../lib/db/prisma";
import {
  campaignInput,
  createCommunicationFixture,
  resetCommunicationTestDatabase,
} from "../../communications/helpers/fixture";
import {
  createPayableOrder,
  createPaymentFixture,
} from "../../payments/helpers/payment-fixture";
import { resetStorageTestDatabase } from "../../storage/helpers/storage-fixture";

test("Gate 6C retryable refunds retain exact refundable capacity", { concurrency: false }, async (t) => {
  const fixture = await createPaymentFixture("gate6c-capacity");
  const provider = new DeterministicPaymentProvider(
    "gate6c-capacity-webhook-secret-with-safe-entropy",
  );
  const originalRefund = provider.refundPayment.bind(provider);
  let failNextRefund = false;
  let providerCalls = 0;
  provider.refundPayment = async (input) => {
    providerCalls += 1;
    if (failNextRefund) {
      failNextRefund = false;
      return {
        outcome: "TRANSIENT_FAILURE",
        safeCode: "TEMPORARY_UNAVAILABLE",
      };
    }
    return originalRefund(input);
  };
  setPaymentProviderForTests(provider);

  t.after(async () => {
    setRefundRetryTestHook(undefined);
    setPaymentProviderForTests(null);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  const first = await capturedIntent(fixture, "10000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "10000.000",
    expectedVersion: first.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: first.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const retryableFull = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: first.id },
  });
  assert.equal(retryableFull.status, "FAILED");
  assert.equal(retryableFull.retryable, true);
  const callsBeforeBlockedCreation = providerCalls;
  await assert.rejects(
    requestBusinessRefund(fixture.ownerReference, {
      amount: "10000.000",
      expectedVersion: first.version,
      idempotencyKey: randomUUID(),
      paymentIntentId: first.id,
      reasonCode: "ADMIN_CORRECTION",
    }),
    paymentCode("REFUND_AMOUNT_EXCEEDED"),
  );
  assert.equal(providerCalls, callsBeforeBlockedCreation);

  await prisma.paymentRefund.update({
    where: { id: retryableFull.id },
    data: {
      nextRetryAt: null,
      retryable: false,
      safeProviderCode: "PERMANENT_FAILURE",
    },
  });
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "10000.000",
    expectedVersion: first.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: first.id,
    reasonCode: "ADMIN_CORRECTION",
  });

  const exhaustedIntent = await capturedIntent(fixture, "9000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "9000.000",
    expectedVersion: exhaustedIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: exhaustedIntent.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const exhausted = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: exhaustedIntent.id },
  });
  await prisma.paymentRefund.update({
    where: { id: exhausted.id },
    data: {
      nextRetryAt: null,
      retryCount: 5,
      retryable: false,
    },
  });
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "9000.000",
    expectedVersion: exhaustedIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: exhaustedIntent.id,
    reasonCode: "ADMIN_CORRECTION",
  });

  const cancelledIntent = await capturedIntent(fixture, "8000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "8000.000",
    expectedVersion: cancelledIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: cancelledIntent.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const cancelled = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: cancelledIntent.id },
  });
  await prisma.paymentRefund.update({
    where: { id: cancelled.id },
    data: {
      nextRetryAt: null,
      retryable: null,
      status: "CANCELLED",
    },
  });
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "8000.000",
    expectedVersion: cancelledIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: cancelledIntent.id,
    reasonCode: "ADMIN_CORRECTION",
  });

  const partialIntent = await capturedIntent(fixture, "10000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "6000.000",
    expectedVersion: partialIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: partialIntent.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  await assert.rejects(
    requestBusinessRefund(fixture.ownerReference, {
      amount: "5000.000",
      expectedVersion: partialIntent.version,
      idempotencyKey: randomUUID(),
      paymentIntentId: partialIntent.id,
      reasonCode: "ADMIN_CORRECTION",
    }),
    paymentCode("REFUND_AMOUNT_EXCEEDED"),
  );

  const concurrentIntent = await capturedIntent(fixture, "11000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "11000.000",
    expectedVersion: concurrentIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: concurrentIntent.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const concurrentRefund = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: concurrentIntent.id },
  });
  await prisma.paymentRefund.update({
    where: { id: concurrentRefund.id },
    data: { nextRetryAt: new Date(Date.now() - 1_000) },
  });
  const retryJobId = randomUUID();
  const concurrent = await Promise.allSettled([
    retryAdminRefund(
      fixture.adminContext,
      concurrentRefund.id,
      {
        expectedVersion: concurrentRefund.version,
        idempotencyKey: retryJobId,
      },
      undefined,
      {
        claimOwner: `platform-job:${retryJobId}`,
        requireRetryable: true,
      },
    ),
    requestBusinessRefund(fixture.ownerReference, {
      amount: "11000.000",
      expectedVersion: concurrentIntent.version,
      idempotencyKey: randomUUID(),
      paymentIntentId: concurrentIntent.id,
      reasonCode: "ADMIN_CORRECTION",
    }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    (await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: concurrentRefund.id },
    })).status,
    "SUCCEEDED",
  );
  assert.equal(await prisma.financialJournal.count({
    where: {
      paymentIntentId: concurrentIntent.id,
      sourceType: "REFUND",
    },
  }), 1);

  const providerAheadIntent = await capturedIntent(fixture, "12000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "12000.000",
    expectedVersion: providerAheadIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: providerAheadIntent.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const providerAheadA = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: providerAheadIntent.id },
  });
  await prisma.paymentRefund.update({
    where: { id: providerAheadA.id },
    data: { nextRetryAt: null, retryable: false },
  });
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "12000.000",
    expectedVersion: providerAheadIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: providerAheadIntent.id,
    reasonCode: "ADMIN_CORRECTION",
  });
  const resetA = await prisma.paymentRefund.update({
    where: { id: providerAheadA.id },
    data: {
      nextRetryAt: new Date(Date.now() - 1_000),
      retryable: true,
      safeProviderCode: "TEMPORARY_UNAVAILABLE",
    },
  });
  const callsBeforeCapacityRetry = providerCalls;
  const blockedJobId = randomUUID();
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      resetA.id,
      {
        expectedVersion: resetA.version,
        idempotencyKey: blockedJobId,
      },
      undefined,
      {
        claimOwner: `platform-job:${blockedJobId}`,
        requireRetryable: true,
      },
    ),
    paymentCode("REFUND_AMOUNT_EXCEEDED"),
  );
  assert.equal(providerCalls, callsBeforeCapacityRetry);
  assert.equal(await prisma.financialJournal.count({
    where: { paymentRefundId: resetA.id, sourceType: "REFUND" },
  }), 0);
  assert.equal(
    (await prisma.paymentRefund.findUniqueOrThrow({ where: { id: resetA.id } }))
      .providerRequestReference,
    resetA.providerRequestReference,
  );

  const competingIntent = await capturedIntent(fixture, "10000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "6000.000",
    expectedVersion: competingIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: competingIntent.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const competingA = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: competingIntent.id },
  });
  await prisma.paymentRefund.update({
    where: { id: competingA.id },
    data: { nextRetryAt: null, retryable: false },
  });
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "5000.000",
    expectedVersion: competingIntent.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: competingIntent.id,
    reasonCode: "ADMIN_CORRECTION",
  });
  const competing = await prisma.paymentRefund.findMany({
    where: { paymentIntentId: competingIntent.id },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(competing.length, 2);
  await prisma.paymentRefund.updateMany({
    where: {
      id: { in: competing.map((refund) => refund.id) },
    },
    data: {
      nextRetryAt: new Date(Date.now() - 1_000),
      retryable: true,
    },
  });
  const callsBeforeCompetingRetries = providerCalls;
  const dueCompeting = await prisma.paymentRefund.findMany({
    where: { paymentIntentId: competingIntent.id },
  });
  const competingJobs = dueCompeting.map((refund) => {
    const id = randomUUID();
    return {
      jobId: id,
      promise: retryAdminRefund(
        fixture.adminContext,
        refund.id,
        {
          expectedVersion: refund.version,
          idempotencyKey: id,
        },
        undefined,
        {
          claimOwner: `platform-job:${id}`,
          requireRetryable: true,
        },
      ),
    };
  });
  const competingResults = await Promise.allSettled(
    competingJobs.map(({ promise }) => promise),
  );
  assert.equal(
    competingResults.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    competingResults.filter(
      (result) => result.status === "rejected"
        && paymentCode("REFUND_AMOUNT_EXCEEDED")(result.reason),
    ).length,
    1,
  );
  assert.equal(providerCalls, callsBeforeCompetingRetries + 1);
  assert.equal(await prisma.financialJournal.count({
    where: {
      paymentIntentId: competingIntent.id,
      sourceType: "REFUND",
    },
  }), 1);
});

test("Gate 6C exact PaymentAttempt jobs recover before and after provider work", { concurrency: false }, async (t) => {
  const fixture = await createPaymentFixture("gate6c-attempt-recovery");
  const provider = new DeterministicPaymentProvider(
    "gate6c-attempt-recovery-secret-with-safe-entropy",
  );
  const originalCreate = provider.createPayment.bind(provider);
  let failNextCreate = false;
  let revokeDuringCreate = false;
  let attemptAuthorityRevoked = false;
  const requestReferences: string[] = [];
  provider.createPayment = async (input) => {
    requestReferences.push(input.providerRequestReference);
    if (failNextCreate) {
      failNextCreate = false;
      return {
        outcome: "TRANSIENT_FAILURE",
        safeCode: "TEMPORARY_UNAVAILABLE",
      };
    }
    const result = await originalCreate(input);
    if (revokeDuringCreate) attemptAuthorityRevoked = true;
    return result;
  };
  setPaymentProviderForTests(provider);
  t.after(async () => {
    setPaymentAttemptRetryTestHook(undefined);
    setPaymentProviderForTests(null);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  const beforeProvider = await failedPaymentAttempt(
    fixture,
    provider,
    () => {
      failNextCreate = true;
    },
  );
  const beforeProviderJob = randomUUID();
  setPaymentAttemptRetryTestHook(({ phase }) => {
    if (phase === "AFTER_CLAIM_BEFORE_PROVIDER") {
      throw new Error("deterministic crash before provider");
    }
  });
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: beforeProvider.attempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: beforeProvider.attempt.version,
      jobId: beforeProviderJob,
    }),
  );
  const claimedBeforeProvider = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: beforeProvider.attempt.id },
  });
  assert.equal(claimedBeforeProvider.status, "PROCESSING");
  assert.equal(claimedBeforeProvider.claimedBy, `platform-job:${beforeProviderJob}`);
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: beforeProvider.attempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: beforeProvider.attempt.version,
      jobId: beforeProviderJob,
    }),
    retryablePaymentOperation,
  );
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: beforeProvider.attempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: beforeProvider.attempt.version + 99,
      jobId: randomUUID(),
    }),
    retryablePaymentOperation,
  );
  assert.equal(
    (await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: beforeProvider.attempt.id },
    })).claimedBy,
    `platform-job:${beforeProviderJob}`,
  );
  await prisma.paymentAttempt.update({
    where: { id: beforeProvider.attempt.id },
    data: { claimExpiresAt: new Date(Date.now() - 1_000) },
  });
  setPaymentAttemptRetryTestHook(undefined);
  await retryPaymentAttemptFromAutomation(fixture.adminContext, {
    attemptId: beforeProvider.attempt.id,
    executionGuard: noPaymentGuard,
    expectedVersion: beforeProvider.attempt.version,
    jobId: beforeProviderJob,
  });
  assert.equal(
    (await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: beforeProvider.attempt.id },
    })).status,
    "CAPTURED",
  );

  const afterProvider = await failedPaymentAttempt(
    fixture,
    provider,
    () => {
      failNextCreate = true;
    },
  );
  const afterProviderJob = randomUUID();
  setPaymentAttemptRetryTestHook(({ phase }) => {
    if (phase === "AFTER_PROVIDER_BEFORE_APPLY") {
      throw new Error("deterministic crash after provider");
    }
  });
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: afterProvider.attempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: afterProvider.attempt.version,
      jobId: afterProviderJob,
    }),
  );
  const stableReference = (
    await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: afterProvider.attempt.id },
    })
  ).providerRequestReference;
  await prisma.paymentAttempt.update({
    where: { id: afterProvider.attempt.id },
    data: { claimExpiresAt: new Date(Date.now() - 1_000) },
  });
  setPaymentAttemptRetryTestHook(undefined);
  await retryPaymentAttemptFromAutomation(fixture.adminContext, {
    attemptId: afterProvider.attempt.id,
    executionGuard: noPaymentGuard,
    expectedVersion: afterProvider.attempt.version,
    jobId: afterProviderJob,
  });
  const recoveredAfterProvider = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: afterProvider.attempt.id },
  });
  assert.equal(recoveredAfterProvider.status, "CAPTURED");
  assert.equal(recoveredAfterProvider.providerRequestReference, stableReference);
  assert.equal(await prisma.financialJournal.count({
    where: {
      paymentIntentId: afterProvider.intent.id,
      sourceType: "CAPTURE",
    },
  }), 1);
  assert.equal(
    requestReferences.filter((reference) => reference === stableReference).length,
    3,
  );

  provider.configureDefaultScenario("REQUIRES_ACTION");
  const eventOrder = await createPayableOrder({
    customerId: fixture.customer.person.id,
    storeId: fixture.store.id,
    total: "13000.000",
  });
  const eventIntentDto = await createCustomerPaymentIntent(
    fixture.customer.person.id,
    {
      idempotencyKey: randomUUID(),
      targetId: eventOrder.id,
      targetType: "ORDER",
    },
  );
  const eventIntent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: eventIntentDto.id },
  });
  const eventAttempt = await prisma.paymentAttempt.findFirstOrThrow({
    where: { paymentIntentId: eventIntent.id },
  });
  const dueEventAttempt = await prisma.paymentAttempt.update({
    where: { id: eventAttempt.id },
    data: {
      finishedAt: new Date(),
      nextRetryAt: new Date(Date.now() - 1_000),
      retryable: true,
      safeProviderCode: "TEMPORARY_UNAVAILABLE",
      status: "FAILED",
      version: { increment: 1 },
    },
  });
  await prisma.paymentIntent.update({
    where: { id: eventIntent.id },
    data: { status: "CREATED", version: { increment: 1 } },
  });
  const eventJobId = randomUUID();
  setPaymentAttemptRetryTestHook(({ phase }) => {
    if (phase === "AFTER_CLAIM_BEFORE_PROVIDER") {
      throw new Error("event race claim interruption");
    }
  });
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: dueEventAttempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: dueEventAttempt.version,
      jobId: eventJobId,
    }),
  );
  const occurredAt = new Date();
  const signed = provider.signWebhook({
    amount: "13000.000",
    currency: "IQD",
    eventId: `gate6c-event-race-${randomUUID()}`,
    occurredAt,
    outcome: "CAPTURED",
    providerReference: eventIntent.providerReference!,
    safeCode: null,
  }, occurredAt);
  await processPaymentProviderWebhook({ ...signed, receivedAt: occurredAt });
  const storedEvent = await prisma.paymentProviderEvent.findFirstOrThrow({
    where: { paymentIntentId: eventIntent.id },
  });
  await processVerifiedPaymentProviderEvent({
    eventId: storedEvent.id,
    executionGuard: noPaymentGuard,
    expectedVersion: storedEvent.processingVersion,
  });
  setPaymentAttemptRetryTestHook(undefined);
  const terminalAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: dueEventAttempt.id },
  });
  assert.equal(terminalAttempt.status, "CANCELLED");
  assert.equal(terminalAttempt.claimedBy, null);
  assert.notEqual(terminalAttempt.finishedAt, null);
  assert.equal(
    (await retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: dueEventAttempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: dueEventAttempt.version,
      jobId: eventJobId,
    })).outcome,
    "COMPLETED",
  );
  assert.equal(await prisma.financialJournal.count({
    where: { paymentIntentId: eventIntent.id, sourceType: "CAPTURE" },
  }), 1);

  const revokedAfterClaim = await failedPaymentAttempt(
    fixture,
    provider,
    () => {
      failNextCreate = true;
    },
  );
  const revokedAfterClaimJob = randomUUID();
  let revokedAfterClaimGuardCalls = 0;
  const revokeAfterClaimGuard: PaymentExecutionGuard = async () => {
    revokedAfterClaimGuardCalls += 1;
    if (revokedAfterClaimGuardCalls > 1) {
      throw new Error("payment attempt authority revoked after claim");
    }
  };
  const callsBeforeClaimRevocation = requestReferences.length;
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: revokedAfterClaim.attempt.id,
      executionGuard: revokeAfterClaimGuard,
      expectedVersion: revokedAfterClaim.attempt.version,
      jobId: revokedAfterClaimJob,
    }),
  );
  const recoveredClaimRevocation =
    await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: revokedAfterClaim.attempt.id },
    });
  assert.equal(requestReferences.length, callsBeforeClaimRevocation);
  assert.equal(recoveredClaimRevocation.status, "FAILED");
  assert.equal(recoveredClaimRevocation.claimedBy, null);
  assert.notEqual(recoveredClaimRevocation.finishedAt, null);
  assert.equal(
    (await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: revokedAfterClaim.intent.id },
    })).status,
    "CREATED",
  );

  const revokedDuringProvider = await failedPaymentAttempt(
    fixture,
    provider,
    () => {
      failNextCreate = true;
    },
  );
  const revokedDuringProviderJob = randomUUID();
  attemptAuthorityRevoked = false;
  revokeDuringCreate = true;
  const revokeDuringProviderGuard: PaymentExecutionGuard = async () => {
    if (attemptAuthorityRevoked) {
      throw new Error("payment attempt authority revoked during provider call");
    }
  };
  const callsBeforeProviderRevocation = requestReferences.length;
  await assert.rejects(
    retryPaymentAttemptFromAutomation(fixture.adminContext, {
      attemptId: revokedDuringProvider.attempt.id,
      executionGuard: revokeDuringProviderGuard,
      expectedVersion: revokedDuringProvider.attempt.version,
      jobId: revokedDuringProviderJob,
    }),
  );
  revokeDuringCreate = false;
  attemptAuthorityRevoked = false;
  const recoveredProviderRevocation =
    await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: revokedDuringProvider.attempt.id },
    });
  assert.equal(requestReferences.length, callsBeforeProviderRevocation + 1);
  assert.equal(
    recoveredProviderRevocation.providerRequestReference,
    revokedDuringProvider.attempt.providerRequestReference,
  );
  assert.equal(recoveredProviderRevocation.status, "FAILED");
  assert.equal(recoveredProviderRevocation.claimedBy, null);
  assert.notEqual(recoveredProviderRevocation.finishedAt, null);
  assert.equal(await prisma.financialJournal.count({
    where: {
      paymentIntentId: revokedDuringProvider.intent.id,
      sourceType: "CAPTURE",
    },
  }), 0);
  assert.equal(
    (await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: revokedDuringProvider.intent.id },
    })).status,
    "CREATED",
  );
});

test("Gate 6C exact PaymentRefund jobs terminalize mutations and recover stable provider work", { concurrency: false }, async (t) => {
  const fixture = await createPaymentFixture("gate6c-refund-recovery");
  const provider = new DeterministicPaymentProvider(
    "gate6c-refund-recovery-secret-with-safe-entropy",
  );
  const originalRefund = provider.refundPayment.bind(provider);
  let failNextRefund = false;
  let revokeDuringRefund = false;
  let refundAuthorityRevoked = false;
  const providerReferences: string[] = [];
  provider.refundPayment = async (input) => {
    providerReferences.push(input.providerRequestReference);
    if (failNextRefund) {
      failNextRefund = false;
      return {
        outcome: "TRANSIENT_FAILURE",
        safeCode: "TEMPORARY_UNAVAILABLE",
      };
    }
    const result = await originalRefund(input);
    if (revokeDuringRefund) refundAuthorityRevoked = true;
    return result;
  };
  setPaymentProviderForTests(provider);
  t.after(async () => {
    setRefundRetryTestHook(undefined);
    setPaymentProviderForTests(null);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  const payment = await capturedIntent(fixture, "15000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "3000.000",
    expectedVersion: payment.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: payment.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const refund = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: payment.id },
  });
  await prisma.paymentRefund.update({
    where: { id: refund.id },
    data: { nextRetryAt: new Date(Date.now() - 1_000) },
  });
  const jobId = randomUUID();
  setRefundRetryTestHook(({ phase }) => {
    if (phase === "AFTER_CLAIM_BEFORE_PROVIDER") {
      throw new Error("refund crash before provider");
    }
  });
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      refund.id,
      {
        expectedVersion: refund.version,
        idempotencyKey: jobId,
      },
      noPaymentGuard,
      {
        claimOwner: `platform-job:${jobId}`,
        requireRetryable: true,
      },
    ),
  );
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      refund.id,
      {
        expectedVersion: refund.version,
        idempotencyKey: jobId,
      },
      noPaymentGuard,
      {
        claimOwner: `platform-job:${jobId}`,
        requireRetryable: true,
      },
    ),
    retryablePaymentOperation,
  );
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      refund.id,
      {
        expectedVersion: refund.version,
        idempotencyKey: randomUUID(),
      },
      noPaymentGuard,
      {
        claimOwner: `platform-job:${randomUUID()}`,
        requireRetryable: true,
      },
    ),
    retryablePaymentOperation,
  );
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      refund.id,
      {
        expectedVersion: refund.version + 1,
        idempotencyKey: jobId,
      },
      noPaymentGuard,
      {
        claimOwner: `platform-job:${jobId}`,
        requireRetryable: true,
      },
    ),
    paymentCode("IDEMPOTENCY_CONFLICT"),
  );
  const processingMutation = await prisma.paymentMutation.findUniqueOrThrow({
    where: {
      actorKey_idempotencyKey: {
        actorKey: `admin:${fixture.adminContext.userId}`,
        idempotencyKey: jobId,
      },
    },
  });
  assert.equal(processingMutation.status, "PROCESSING");
  await prisma.paymentRefund.update({
    where: { id: refund.id },
    data: { claimExpiresAt: new Date(Date.now() - 1_000) },
  });
  setRefundRetryTestHook(undefined);
  await retryAdminRefund(
    fixture.adminContext,
    refund.id,
    {
      expectedVersion: refund.version,
      idempotencyKey: jobId,
    },
    noPaymentGuard,
    {
      claimOwner: `platform-job:${jobId}`,
      requireRetryable: true,
    },
  );
  const completedRefund = await prisma.paymentRefund.findUniqueOrThrow({
    where: { id: refund.id },
  });
  assert.equal(completedRefund.status, "SUCCEEDED");
  assert.equal(
    (await prisma.paymentMutation.findUniqueOrThrow({
      where: {
        actorKey_idempotencyKey: {
          actorKey: `admin:${fixture.adminContext.userId}`,
          idempotencyKey: jobId,
        },
      },
    })).status,
    "COMPLETED",
  );
  const terminalReplay = await retryAdminRefund(
    fixture.adminContext,
    refund.id,
    {
      expectedVersion: refund.version,
      idempotencyKey: jobId,
    },
    noPaymentGuard,
    {
      claimOwner: `platform-job:${jobId}`,
      requireRetryable: true,
    },
  );
  assert.equal(terminalReplay.id, payment.id);
  assert.equal(await prisma.financialJournal.count({
    where: { paymentRefundId: refund.id, sourceType: "REFUND" },
  }), 1);

  const uncertainPayment = await capturedIntent(fixture, "16000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "4000.000",
    expectedVersion: uncertainPayment.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: uncertainPayment.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const uncertainRefund = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: uncertainPayment.id },
  });
  await prisma.paymentRefund.update({
    where: { id: uncertainRefund.id },
    data: { nextRetryAt: new Date(Date.now() - 1_000) },
  });
  const uncertainJobId = randomUUID();
  setRefundRetryTestHook(({ phase }) => {
    if (phase === "AFTER_PROVIDER_BEFORE_APPLY") {
      throw new Error("refund crash after provider");
    }
  });
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      uncertainRefund.id,
      {
        expectedVersion: uncertainRefund.version,
        idempotencyKey: uncertainJobId,
      },
      noPaymentGuard,
      {
        claimOwner: `platform-job:${uncertainJobId}`,
        requireRetryable: true,
      },
    ),
  );
  const stableReference = (
    await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: uncertainRefund.id },
    })
  ).providerRequestReference;
  await prisma.paymentRefund.update({
    where: { id: uncertainRefund.id },
    data: { claimExpiresAt: new Date(Date.now() - 1_000) },
  });
  setRefundRetryTestHook(undefined);
  await retryAdminRefund(
    fixture.adminContext,
    uncertainRefund.id,
    {
      expectedVersion: uncertainRefund.version,
      idempotencyKey: uncertainJobId,
    },
    noPaymentGuard,
    {
      claimOwner: `platform-job:${uncertainJobId}`,
      requireRetryable: true,
    },
  );
  assert.equal(
    providerReferences.filter((reference) => reference === stableReference).length,
    3,
  );
  assert.equal(await prisma.financialJournal.count({
    where: {
      paymentRefundId: uncertainRefund.id,
      sourceType: "REFUND",
    },
  }), 1);
  assert.equal(
    await prisma.paymentMutation.count({
      where: {
        actorKey: `admin:${fixture.adminContext.userId}`,
        idempotencyKey: uncertainJobId,
        status: "PROCESSING",
      },
    }),
    0,
  );

  const claimRevocationPayment = await capturedIntent(fixture, "17000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "5000.000",
    expectedVersion: claimRevocationPayment.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: claimRevocationPayment.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const claimRevocationRefund = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: claimRevocationPayment.id },
  });
  await prisma.paymentRefund.update({
    where: { id: claimRevocationRefund.id },
    data: { nextRetryAt: new Date(Date.now() - 1_000) },
  });
  let refundClaimGuardCalls = 0;
  const revokeRefundAfterClaimGuard: PaymentExecutionGuard = async () => {
    refundClaimGuardCalls += 1;
    if (refundClaimGuardCalls > 1) {
      throw new Error("refund authority revoked after claim");
    }
  };
  const claimRevocationJob = randomUUID();
  const callsBeforeRefundClaimRevocation = providerReferences.length;
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      claimRevocationRefund.id,
      {
        expectedVersion: claimRevocationRefund.version,
        idempotencyKey: claimRevocationJob,
      },
      revokeRefundAfterClaimGuard,
      {
        claimOwner: `platform-job:${claimRevocationJob}`,
        requireRetryable: true,
      },
    ),
  );
  const recoveredRefundClaimRevocation =
    await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: claimRevocationRefund.id },
    });
  assert.equal(providerReferences.length, callsBeforeRefundClaimRevocation);
  assert.equal(recoveredRefundClaimRevocation.status, "FAILED");
  assert.equal(recoveredRefundClaimRevocation.claimedBy, null);
  assert.equal(
    (await prisma.paymentMutation.findUniqueOrThrow({
      where: {
        actorKey_idempotencyKey: {
          actorKey: `admin:${fixture.adminContext.userId}`,
          idempotencyKey: claimRevocationJob,
        },
      },
    })).status,
    "FAILED",
  );

  const providerRevocationPayment = await capturedIntent(fixture, "18000.000");
  failNextRefund = true;
  await requestBusinessRefund(fixture.ownerReference, {
    amount: "6000.000",
    expectedVersion: providerRevocationPayment.version,
    idempotencyKey: randomUUID(),
    paymentIntentId: providerRevocationPayment.id,
    reasonCode: "CUSTOMER_REQUEST",
  });
  const providerRevocationRefund = await prisma.paymentRefund.findFirstOrThrow({
    where: { paymentIntentId: providerRevocationPayment.id },
  });
  await prisma.paymentRefund.update({
    where: { id: providerRevocationRefund.id },
    data: { nextRetryAt: new Date(Date.now() - 1_000) },
  });
  refundAuthorityRevoked = false;
  revokeDuringRefund = true;
  const revokeRefundDuringProviderGuard: PaymentExecutionGuard = async () => {
    if (refundAuthorityRevoked) {
      throw new Error("refund authority revoked during provider call");
    }
  };
  const providerRevocationJob = randomUUID();
  const callsBeforeRefundProviderRevocation = providerReferences.length;
  await assert.rejects(
    retryAdminRefund(
      fixture.adminContext,
      providerRevocationRefund.id,
      {
        expectedVersion: providerRevocationRefund.version,
        idempotencyKey: providerRevocationJob,
      },
      revokeRefundDuringProviderGuard,
      {
        claimOwner: `platform-job:${providerRevocationJob}`,
        requireRetryable: true,
      },
    ),
  );
  revokeDuringRefund = false;
  refundAuthorityRevoked = false;
  const recoveredRefundProviderRevocation =
    await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: providerRevocationRefund.id },
    });
  assert.equal(providerReferences.length, callsBeforeRefundProviderRevocation + 1);
  assert.equal(
    recoveredRefundProviderRevocation.providerRequestReference,
    providerRevocationRefund.providerRequestReference,
  );
  assert.equal(recoveredRefundProviderRevocation.status, "FAILED");
  assert.equal(recoveredRefundProviderRevocation.claimedBy, null);
  assert.equal(await prisma.financialJournal.count({
    where: {
      paymentRefundId: providerRevocationRefund.id,
      sourceType: "REFUND",
    },
  }), 0);
  assert.equal(
    (await prisma.paymentMutation.findUniqueOrThrow({
      where: {
        actorKey_idempotencyKey: {
          actorKey: `admin:${fixture.adminContext.userId}`,
          idempotencyKey: providerRevocationJob,
        },
      },
    })).status,
    "FAILED",
  );
});

test("Gate 6C exact OutboundDelivery jobs reuse attempts and converge after interruption", { concurrency: false }, async (t) => {
  await resetCommunicationTestDatabase();
  const fixture = await createCommunicationFixture("gate6c-delivery-recovery");
  setCommunicationTestProviderFactory(
    (channel) => new DeterministicSinkProvider(channel),
  );
  t.after(async () => {
    setDeliveryAutomationTestHook(undefined);
    setCommunicationTestProviderFactory(undefined);
    await resetCommunicationTestDatabase();
    await prisma.$disconnect();
  });
  const noGuard = async () => undefined;

  const beforeAttempt = await pendingDelivery(fixture);
  const beforeAttemptOwner = `platform-job:${randomUUID()}`;
  setDeliveryAutomationTestHook(({ phase }) => {
    if (phase === "AFTER_CLAIM_BEFORE_ATTEMPT") {
      throw new Error("delivery crash after claim");
    }
  });
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: beforeAttemptOwner,
    deliveryId: beforeAttempt.id,
    executionGuard: noGuard,
    expectedVersion: beforeAttempt.version,
  }));
  assert.equal(await prisma.outboundDeliveryAttempt.count({
    where: { deliveryId: beforeAttempt.id },
  }), 0);
  await assert.rejects(
    processExactDeliveryForAutomation({
      claimOwner: beforeAttemptOwner,
      deliveryId: beforeAttempt.id,
      executionGuard: noGuard,
      expectedVersion: beforeAttempt.version,
    }),
    retryableCommunicationOperation,
  );
  await expireDeliveryClaim(beforeAttempt.id);
  setDeliveryAutomationTestHook(undefined);
  assert.equal((await processExactDeliveryForAutomation({
    claimOwner: beforeAttemptOwner,
    deliveryId: beforeAttempt.id,
    executionGuard: noGuard,
    expectedVersion: beforeAttempt.version,
  })).state, "ACCEPTED");

  const afterAttempt = await pendingDelivery(fixture);
  const afterAttemptOwner = `platform-job:${randomUUID()}`;
  setDeliveryAutomationTestHook(({ phase }) => {
    if (phase === "AFTER_ATTEMPT_BEFORE_PROVIDER") {
      throw new Error("delivery crash after attempt");
    }
  });
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: afterAttemptOwner,
    deliveryId: afterAttempt.id,
    executionGuard: noGuard,
    expectedVersion: afterAttempt.version,
  }));
  const unfinished = await prisma.outboundDeliveryAttempt.findFirstOrThrow({
    where: { deliveryId: afterAttempt.id },
  });
  assert.equal(unfinished.finishedAt, null);
  await expireDeliveryClaim(afterAttempt.id);
  setDeliveryAutomationTestHook(undefined);
  await processExactDeliveryForAutomation({
    claimOwner: afterAttemptOwner,
    deliveryId: afterAttempt.id,
    executionGuard: noGuard,
    expectedVersion: afterAttempt.version,
  });
  const reused = await prisma.outboundDeliveryAttempt.findMany({
    where: { deliveryId: afterAttempt.id },
  });
  assert.equal(reused.length, 1);
  assert.equal(reused[0]?.id, unfinished.id);
  assert.equal(reused[0]?.outcome, "ACCEPTED");

  const afterProvider = await pendingDelivery(fixture);
  const providerKeys: string[] = [];
  let providerCalls = 0;
  setCommunicationTestProviderFactory((channel): OutboundProvider => {
    const provider = new DeterministicSinkProvider(channel);
    return {
      channel,
      send: async (message) => {
        providerCalls += 1;
        providerKeys.push(message.providerIdempotencyKey);
        return provider.send(message);
      },
    };
  });
  const afterProviderOwner = `platform-job:${randomUUID()}`;
  setDeliveryAutomationTestHook(({ phase }) => {
    if (phase === "AFTER_PROVIDER_BEFORE_FINALIZE") {
      throw new Error("delivery crash after provider");
    }
  });
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: afterProviderOwner,
    deliveryId: afterProvider.id,
    executionGuard: noGuard,
    expectedVersion: afterProvider.version,
  }));
  await expireDeliveryClaim(afterProvider.id);
  setDeliveryAutomationTestHook(undefined);
  await processExactDeliveryForAutomation({
    claimOwner: afterProviderOwner,
    deliveryId: afterProvider.id,
    executionGuard: noGuard,
    expectedVersion: afterProvider.version,
  });
  assert.equal(providerCalls, 2);
  assert.equal(new Set(providerKeys).size, 1);
  assert.equal(await prisma.outboundDeliveryAttempt.count({
    where: { deliveryId: afterProvider.id },
  }), 1);

  const foreignClaim = await pendingDelivery(fixture);
  const exactOwner = `platform-job:${randomUUID()}`;
  setDeliveryAutomationTestHook(({ phase }) => {
    if (phase === "AFTER_CLAIM_BEFORE_ATTEMPT") {
      throw new Error("delivery foreign claim setup");
    }
  });
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: exactOwner,
    deliveryId: foreignClaim.id,
    executionGuard: noGuard,
    expectedVersion: foreignClaim.version,
  }));
  await prisma.outboundDelivery.update({
    where: { id: foreignClaim.id },
    data: { claimOwner: "platform-job:foreign-live-owner" },
  });
  await assert.rejects(
    processExactDeliveryForAutomation({
      claimOwner: exactOwner,
      deliveryId: foreignClaim.id,
      executionGuard: noGuard,
      expectedVersion: foreignClaim.version,
    }),
    retryableCommunicationOperation,
  );
  assert.equal(
    (await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: foreignClaim.id },
    })).claimOwner,
    "platform-job:foreign-live-owner",
  );
  await expireDeliveryClaim(foreignClaim.id);
  setDeliveryAutomationTestHook(undefined);
  await processExactDeliveryForAutomation({
    claimOwner: exactOwner,
    deliveryId: foreignClaim.id,
    executionGuard: noGuard,
    expectedVersion: foreignClaim.version,
  });

  const cancelled = await pendingDelivery(fixture);
  const cancelledOwner = `platform-job:${randomUUID()}`;
  setDeliveryAutomationTestHook(({ phase }) => {
    if (phase === "AFTER_ATTEMPT_BEFORE_PROVIDER") {
      throw new Error("delivery cancellation setup");
    }
  });
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: cancelledOwner,
    deliveryId: cancelled.id,
    executionGuard: noGuard,
    expectedVersion: cancelled.version,
  }));
  await prisma.communicationCampaign.update({
    where: { id: cancelled.campaignId },
    data: {
      cancelledAt: new Date(),
      cancellationReason: "Gate 6C cancellation recovery fixture",
      status: "CANCELLED",
      version: { increment: 1 },
    },
  });
  await expireDeliveryClaim(cancelled.id);
  setDeliveryAutomationTestHook(undefined);
  const cancelledResult = await processExactDeliveryForAutomation({
    claimOwner: cancelledOwner,
    deliveryId: cancelled.id,
    executionGuard: noGuard,
    expectedVersion: cancelled.version,
  });
  assert.equal(cancelledResult.state, "CANCELLED");
  assert.equal(
    (await prisma.outboundDeliveryAttempt.findFirstOrThrow({
      where: { deliveryId: cancelled.id },
    })).finishedAt !== null,
    true,
  );
  assert.equal(await prisma.outboundDelivery.count({
    where: { status: "CLAIMED" },
  }), 0);
  assert.equal(await prisma.outboundDeliveryAttempt.count({
    where: { finishedAt: null },
  }), 0);

  const revokedAfterClaim = await pendingDelivery(fixture);
  let deliveryClaimGuardCalls = 0;
  const revokeDeliveryAfterClaimGuard = async () => {
    deliveryClaimGuardCalls += 1;
    if (deliveryClaimGuardCalls > 1) {
      throw new Error("delivery authority revoked after claim");
    }
  };
  const callsBeforeDeliveryClaimRevocation = providerCalls;
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: `platform-job:${randomUUID()}`,
    deliveryId: revokedAfterClaim.id,
    executionGuard: revokeDeliveryAfterClaimGuard,
    expectedVersion: revokedAfterClaim.version,
  }));
  const recoveredDeliveryClaimRevocation =
    await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: revokedAfterClaim.id },
    });
  assert.equal(providerCalls, callsBeforeDeliveryClaimRevocation);
  assert.equal(recoveredDeliveryClaimRevocation.status, "RETRY_SCHEDULED");
  assert.equal(recoveredDeliveryClaimRevocation.claimOwner, null);
  assert.equal(await prisma.outboundDeliveryAttempt.count({
    where: { deliveryId: revokedAfterClaim.id, finishedAt: null },
  }), 0);

  const revokedDuringProvider = await pendingDelivery(fixture);
  let deliveryAuthorityRevoked = false;
  setCommunicationTestProviderFactory((channel): OutboundProvider => {
    const provider = new DeterministicSinkProvider(channel);
    return {
      channel,
      send: async (message) => {
        providerCalls += 1;
        providerKeys.push(message.providerIdempotencyKey);
        const result = await provider.send(message);
        deliveryAuthorityRevoked = true;
        return result;
      },
    };
  });
  const revokeDeliveryDuringProviderGuard = async () => {
    if (deliveryAuthorityRevoked) {
      throw new Error("delivery authority revoked during provider call");
    }
  };
  const callsBeforeDeliveryProviderRevocation = providerCalls;
  await assert.rejects(processExactDeliveryForAutomation({
    claimOwner: `platform-job:${randomUUID()}`,
    deliveryId: revokedDuringProvider.id,
    executionGuard: revokeDeliveryDuringProviderGuard,
    expectedVersion: revokedDuringProvider.version,
  }));
  const recoveredDeliveryProviderRevocation =
    await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: revokedDuringProvider.id },
    });
  assert.equal(providerCalls, callsBeforeDeliveryProviderRevocation + 1);
  assert.equal(recoveredDeliveryProviderRevocation.status, "RETRY_SCHEDULED");
  assert.equal(recoveredDeliveryProviderRevocation.claimOwner, null);
  const finalizedRevokedAttempt =
    await prisma.outboundDeliveryAttempt.findFirstOrThrow({
      where: { deliveryId: revokedDuringProvider.id },
    });
  assert.notEqual(finalizedRevokedAttempt.finishedAt, null);
  assert.equal(finalizedRevokedAttempt.outcome, "TRANSIENT_FAILURE");
});

async function capturedIntent(
  fixture: Awaited<ReturnType<typeof createPaymentFixture>>,
  total: string,
) {
  const order = await createPayableOrder({
    customerId: fixture.customer.person.id,
    storeId: fixture.store.id,
    total,
  });
  const payment = await createCustomerPaymentIntent(fixture.customer.person.id, {
    idempotencyKey: randomUUID(),
    targetId: order.id,
    targetType: "ORDER",
  });
  const intent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: payment.id },
  });
  assert.equal(intent.status, "CAPTURED");
  return intent;
}

async function failedPaymentAttempt(
  fixture: Awaited<ReturnType<typeof createPaymentFixture>>,
  provider: DeterministicPaymentProvider,
  configureFailure: () => void,
) {
  configureFailure();
  provider.configureDefaultScenario("IMMEDIATE_CAPTURE");
  const order = await createPayableOrder({
    customerId: fixture.customer.person.id,
    storeId: fixture.store.id,
    total: "7000.000",
  });
  const payment = await createCustomerPaymentIntent(fixture.customer.person.id, {
    idempotencyKey: randomUUID(),
    targetId: order.id,
    targetType: "ORDER",
  });
  const intent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: payment.id },
  });
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({
    where: { paymentIntentId: intent.id },
  });
  assert.equal(attempt.status, "FAILED");
  const dueAttempt = await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { nextRetryAt: new Date(Date.now() - 1_000) },
  });
  return { attempt: dueAttempt, intent };
}

async function pendingDelivery(
  fixture: Awaited<ReturnType<typeof createCommunicationFixture>>,
) {
  const campaign = await createCampaign(
    fixture.actors.full,
    campaignInput({
      channels: ["EMAIL"],
      targetPersonId: fixture.people.customer.person.id,
    }),
  );
  await sendCampaignNow(fixture.actors.full, {
    campaignId: campaign.id,
    expectedVersion: campaign.version,
    idempotencyKey: randomUUID(),
  });
  return prisma.outboundDelivery.findFirstOrThrow({
    where: { campaignId: campaign.id, channel: "EMAIL" },
  });
}

async function expireDeliveryClaim(deliveryId: string) {
  await prisma.outboundDelivery.update({
    where: { id: deliveryId },
    data: { claimExpiresAt: new Date(Date.now() - 1_000) },
  });
}

const noPaymentGuard: PaymentExecutionGuard = async () => undefined;

function paymentCode(expected: string) {
  return (error: unknown) =>
    error instanceof PaymentDomainError && error.code === expected;
}

function retryablePaymentOperation(error: unknown) {
  return error instanceof PaymentOperationRetryableError;
}

function retryableCommunicationOperation(error: unknown) {
  return error instanceof CommunicationOperationRetryableError;
}
