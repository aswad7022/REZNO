import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PaymentDomainError } from "../../../features/payments/domain/errors";
import { DeterministicPaymentProvider } from "../../../features/payments/providers/deterministic";
import { setPaymentProviderForTests } from "../../../features/payments/providers/registry";
import {
  createCustomerPaymentIntent,
} from "../../../features/payments/services/payment-intents";
import { processPaymentProviderWebhook } from "../../../features/payments/services/provider-events";
import { requestBusinessRefund } from "../../../features/payments/services/refunds";
import { previewSettlement } from "../../../features/payments/services/settlements";
import {
  triggerGate6CAutomation,
} from "../../../features/communications-payment-automation/services/admin";
import type { PlatformJobAdminContext } from "../../../features/platform-jobs/services/admin-context";
import { setPlatformJobHandlerForTests } from "../../../features/platform-jobs/services/handlers";
import { requeuePlatformJob } from "../../../features/platform-jobs/services/mutations";
import { runPlatformWorkerBatch } from "../../../features/platform-jobs/services/worker";
import { prisma } from "../../../lib/db/prisma";
import {
  createPayableOrder,
  createPaymentFixture,
} from "../../payments/helpers/payment-fixture";
import { resetStorageTestDatabase } from "../../storage/helpers/storage-fixture";

test("Gate 6C payment events and retries are durable, bounded, and exact", { concurrency: false }, async (t) => {
  const fixture = await createPaymentFixture("gate6c-payments");
  const provider = new DeterministicPaymentProvider(
    "gate6c-payment-webhook-secret-with-entropy-2026",
  );
  setPaymentProviderForTests(provider);
  await prisma.adminAccess.update({
    where: { id: fixture.adminAccess.id },
    data: {
      permissions: [
        "PLATFORM_JOBS_VIEW",
        "PLATFORM_JOBS_MANAGE",
        "PAYMENTS_VIEW",
        "PAYMENTS_REFUND",
        "PAYMENTS_RECONCILE",
        "SETTLEMENTS_VIEW",
        "SETTLEMENTS_MANAGE",
      ],
    },
  });
  const context: PlatformJobAdminContext = {
    adminAccessId: fixture.adminAccess.id,
    personId: fixture.actors.admin.personId,
    source: "database",
    userId: fixture.actors.admin.userId,
  };

  t.after(async () => {
    setPlatformJobHandlerForTests("PAYMENT_PROVIDER_EVENT_PROCESS");
    setPaymentProviderForTests(null);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("authenticated event and job persist atomically, replay, and survive requeue", async () => {
    provider.configureDefaultScenario("REQUIRES_ACTION");
    const order = await createPayableOrder({
      customerId: fixture.customer.person.id,
      storeId: fixture.store.id,
      total: "9000.000",
    });
    const payment = await createCustomerPaymentIntent(fixture.customer.person.id, {
      idempotencyKey: randomUUID(),
      targetId: order.id,
      targetType: "ORDER",
    });
    const storedIntent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const now = new Date();
    const eventId = "gate6c-capture-" + randomUUID();
    const signed = provider.signWebhook({
      amount: "9000.000",
      currency: "IQD",
      eventId,
      occurredAt: now,
      outcome: "CAPTURED",
      providerReference: storedIntent.providerReference!,
      safeCode: null,
    }, now);

    const beforeInvalid = {
      events: await prisma.paymentProviderEvent.count(),
      jobs: await prisma.platformJob.count(),
    };
    await assert.rejects(
      processPaymentProviderWebhook({
        ...signed,
        receivedAt: now,
        signature: "0".repeat(64),
      }),
      paymentCode("WEBHOOK_INVALID_SIGNATURE"),
    );
    assert.deepEqual({
      events: await prisma.paymentProviderEvent.count(),
      jobs: await prisma.platformJob.count(),
    }, beforeInvalid);

    const accepted = await processPaymentProviderWebhook({ ...signed, receivedAt: now });
    const replay = await processPaymentProviderWebhook({ ...signed, receivedAt: now });
    assert.equal(accepted.status, "VERIFIED");
    assert.equal(accepted.duplicate, false);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.jobId, accepted.jobId);
    assert.equal(await prisma.paymentProviderEvent.count({
      where: { provider: "DETERMINISTIC_TEST", providerEventId: eventId },
    }), 1);
    assert.equal(await prisma.platformJob.count({
      where: { providerEventId: { not: null } },
    }), 1);
    const changed = provider.signWebhook({
      amount: "8000.000",
      currency: "IQD",
      eventId,
      occurredAt: now,
      outcome: "CAPTURED",
      providerReference: storedIntent.providerReference!,
      safeCode: null,
    }, now);
    await assert.rejects(
      processPaymentProviderWebhook({ ...changed, receivedAt: now }),
      paymentCode("IDEMPOTENCY_CONFLICT"),
    );

    setPlatformJobHandlerForTests("PAYMENT_PROVIDER_EVENT_PROCESS", async () => ({
      errorCode: "PERMANENT_FAILURE",
      outcome: "FAILED",
      retryable: false,
    }));
    await runOne(context);
    const failed = await prisma.platformJob.findUniqueOrThrow({
      where: { id: accepted.jobId! },
    });
    assert.equal(failed.status, "FAILED");
    const requeued = await requeuePlatformJob(context, {
      expectedVersion: failed.version,
      idempotencyKey: randomUUID(),
      jobId: failed.id,
    });
    assert.equal(requeued.replay, false);
    setPlatformJobHandlerForTests("PAYMENT_PROVIDER_EVENT_PROCESS");
    await runOne(context);

    const processedEvent = await prisma.paymentProviderEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: {
          provider: "DETERMINISTIC_TEST",
          providerEventId: eventId,
        },
      },
    });
    assert.equal(processedEvent.status, "PROCESSED");
    assert.equal(
      (await prisma.platformJob.findUniqueOrThrow({ where: { id: requeued.requeuedJobId } })).status,
      "SUCCEEDED",
    );
    assert.equal(
      (await prisma.paymentIntent.findUniqueOrThrow({ where: { id: payment.id } }))
        .capturedAmount.toFixed(3),
      "9000.000",
    );
    assert.equal(await prisma.financialJournal.count({
      where: { paymentIntentId: payment.id, sourceType: "CAPTURE" },
    }), 1);
    assert.doesNotMatch(
      JSON.stringify(processedEvent),
      /signature|authorization|rawBody|gate6c-payment-webhook-secret/u,
    );
    provider.configureDefaultScenario("IMMEDIATE_CAPTURE");
  });

  await t.test("attempt and refund retry discovery preserve stable provider references", async () => {
    const createReferences: string[] = [];
    const originalCreate = provider.createPayment.bind(provider);
    let failCreateOnce = true;
    provider.createPayment = async (input) => {
      createReferences.push(input.providerRequestReference);
      if (failCreateOnce) {
        failCreateOnce = false;
        return { outcome: "TRANSIENT_FAILURE", safeCode: "TEMPORARY_UNAVAILABLE" };
      }
      return originalCreate(input);
    };
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
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { paymentIntentId: payment.id },
    });
    assert.equal(attempt.status, "FAILED");
    assert.equal(attempt.retryable, true);
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { nextRetryAt: new Date(Date.now() - 1_000) },
    });
    await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: randomUUID(),
      jobType: "PAYMENT_RETRY_DISCOVERY",
    });
    await runOne(context);
    await runOne(context);
    assert.equal(createReferences.length, 2);
    assert.equal(createReferences[0], createReferences[1]);
    const captured = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: payment.id },
    });
    assert.equal(captured.status, "CAPTURED");
    assert.equal(await prisma.financialJournal.count({
      where: { paymentIntentId: payment.id, sourceType: "CAPTURE" },
    }), 1);

    const refundReferences: string[] = [];
    const originalRefund = provider.refundPayment.bind(provider);
    let failRefundOnce = true;
    provider.refundPayment = async (input) => {
      refundReferences.push(input.providerRequestReference);
      if (failRefundOnce) {
        failRefundOnce = false;
        return { outcome: "TRANSIENT_FAILURE", safeCode: "TEMPORARY_UNAVAILABLE" };
      }
      return originalRefund(input);
    };
    await requestBusinessRefund(fixture.ownerReference, {
      amount: "1000.000",
      expectedVersion: captured.version,
      idempotencyKey: randomUUID(),
      paymentIntentId: payment.id,
      reasonCode: "CUSTOMER_REQUEST",
    });
    const refund = await prisma.paymentRefund.findFirstOrThrow({
      where: { paymentIntentId: payment.id },
    });
    assert.equal(refund.status, "FAILED");
    assert.equal(refund.retryable, true);
    await prisma.paymentRefund.update({
      where: { id: refund.id },
      data: { nextRetryAt: new Date(Date.now() - 1_000) },
    });
    await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: randomUUID(),
      jobType: "PAYMENT_RETRY_DISCOVERY",
    });
    await runOne(context);
    await runOne(context);
    assert.equal(refundReferences.length, 2);
    assert.equal(refundReferences[0], refundReferences[1]);
    assert.equal(
      (await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refund.id } })).status,
      "SUCCEEDED",
    );
    assert.equal(await prisma.financialJournal.count({
      where: { paymentRefundId: refund.id, sourceType: "REFUND" },
    }), 1);
  });

  await t.test("Migration 48 NULL truth tables and canonical draft uniqueness reject bypasses", async () => {
    const providerJob = await prisma.platformJob.findFirstOrThrow({
      where: { source: "PROVIDER_EVENT" },
    });
    await assert.rejects(prisma.platformJob.update({
      where: { id: providerJob.id },
      data: { source: "ADMIN_MANUAL" },
    }));
    await assert.rejects(prisma.platformJob.update({
      where: { id: providerJob.id },
      data: { providerEventId: null },
    }));
    const providerEvent = await prisma.paymentProviderEvent.findUniqueOrThrow({
      where: { id: providerJob.providerEventId! },
    });
    await assert.rejects(prisma.paymentProviderEvent.update({
      where: { id: providerEvent.id },
      data: { normalizedCurrency: null },
    }));

    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { status: "CAPTURED" },
      orderBy: { createdAt: "desc" },
    });
    await assert.rejects(prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { nextRetryAt: new Date(), retryable: true },
    }));
    await assert.rejects(prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { retryCount: 6 },
    }));
    const refund = await prisma.paymentRefund.findFirstOrThrow({
      where: { status: "SUCCEEDED" },
    });
    await assert.rejects(prisma.paymentRefund.update({
      where: { id: refund.id },
      data: { nextRetryAt: new Date(), retryable: true },
    }));

    const periodStart = new Date("2030-01-01T00:00:00.000Z");
    const periodEnd = new Date("2030-01-02T00:00:00.000Z");
    const first = await previewSettlement(fixture.adminContext, {
      currency: "IQD",
      idempotencyKey: randomUUID(),
      organizationId: fixture.organization.id,
      periodEnd,
      periodStart,
    });
    const replay = await previewSettlement(fixture.adminContext, {
      currency: "IQD",
      idempotencyKey: randomUUID(),
      organizationId: fixture.organization.id,
      periodEnd,
      periodStart,
    });
    assert.equal(replay.id, first.id);
    assert.equal(first.status, "DRAFT");
    await assert.rejects(prisma.settlementBatch.create({
      data: {
        captureGross: "0.000",
        commission: "0.000",
        currency: "IQD",
        idempotencyKey: randomUUID(),
        merchantNet: "0.000",
        organizationId: fixture.organization.id,
        periodEnd,
        periodStart,
        refunds: "0.000",
        requestHash: "0".repeat(64),
      },
    }));
  });

  await t.test("revoked payment authority prevents provider-event claim", async () => {
    provider.configureDefaultScenario("REQUIRES_ACTION");
    const order = await createPayableOrder({
      customerId: fixture.customer.person.id,
      storeId: fixture.store.id,
      total: "5000.000",
    });
    const payment = await createCustomerPaymentIntent(fixture.customer.person.id, {
      idempotencyKey: randomUUID(),
      targetId: order.id,
      targetType: "ORDER",
    });
    const intent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const now = new Date();
    const signed = provider.signWebhook({
      amount: "5000.000",
      currency: "IQD",
      eventId: "gate6c-revoked-" + randomUUID(),
      occurredAt: now,
      outcome: "CAPTURED",
      providerReference: intent.providerReference!,
      safeCode: null,
    }, now);
    const accepted = await processPaymentProviderWebhook({ ...signed, receivedAt: now });
    await prisma.adminAccess.update({
      where: { id: fixture.adminAccess.id },
      data: {
        permissions: ["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"],
      },
    });
    const worker = await runOne(context);
    assert.equal(worker.state, "COMPLETE");
    if (worker.state !== "COMPLETE") {
      throw new Error("The revoked worker operation did not complete.");
    }
    assert.equal(worker.claimed, 0);
    assert.equal(
      (await prisma.platformJob.findUniqueOrThrow({ where: { id: accepted.jobId! } })).status,
      "AVAILABLE",
    );
    assert.equal(
      (await prisma.paymentProviderEvent.findFirstOrThrow({
        where: { paymentIntentId: payment.id },
      })).status,
      "VERIFIED",
    );
  });
});

function runOne(context: PlatformJobAdminContext) {
  return runPlatformWorkerBatch(context, {
    batchSize: 1,
    idempotencyKey: randomUUID(),
  });
}

function paymentCode(expected: string) {
  return (error: unknown) =>
    error instanceof PaymentDomainError && error.code === expected;
}
