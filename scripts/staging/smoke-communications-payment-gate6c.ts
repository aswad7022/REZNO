import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  DeterministicSinkProvider,
  setCommunicationTestProviderFactory,
} from "../../features/communications/providers/provider";
import { setCommunicationTestPushEndpointResolver } from "../../features/communications/services/endpoints";
import {
  communicationsPaymentAutomationStatus,
  triggerGate6CAutomation,
} from "../../features/communications-payment-automation/services/admin";
import { PaymentDomainError } from "../../features/payments/domain/errors";
import { DeterministicPaymentProvider } from "../../features/payments/providers/deterministic";
import {
  paymentProvider,
  setPaymentProviderForTests,
} from "../../features/payments/providers/registry";
import { processPaymentProviderWebhook } from "../../features/payments/services/provider-events";
import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import type { PlatformJobAdminContext } from "../../features/platform-jobs/services/admin-context";
import { runPlatformWorkerBatch } from "../../features/platform-jobs/services/worker";
import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  communicationsPaymentGate6cFixtureFingerprint,
  communicationsPaymentGate6cFixtureIds as ids,
  COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
  seedCommunicationsPaymentGate6cFixture,
} from "./communications-payment-gate6c-fixture";
import { runComposedStagingScript } from "./communications-payment-gate6c-process";
import { assertCommunicationsPaymentGate6cStaging } from "./communications-payment-gate6c-safety";
import { paymentsGate5cFixtureIds } from "./payments-gate5c-fixture";

let phase = "BOOT";

async function main() {
  phase = "SAFETY";
  const transport =
    process.env.REZNO_STAGE6_GATE6C_ALLOW_LOCAL_UNENCRYPTED === "true"
      ? undefined
      : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertCommunicationsPaymentGate6cStaging(
    prisma,
    process.env,
    transport,
  );
  await runComposedStagingScript(
    "seed:staging:outbound-communications-stage4c",
  );
  const seeded = await seedCommunicationsPaymentGate6cFixture(prisma);
  const adminAccess = await prisma.adminAccess.findUniqueOrThrow({
    where: { userId: ids.adminUserId },
    select: { id: true },
  });
  const context: PlatformJobAdminContext = {
    adminAccessId: adminAccess.id,
    personId: ids.adminPersonId,
    source: "database",
    userId: ids.adminUserId,
  };
  let checks = 0;

  phase = "RUNTIME_TRUTH";
  assert.equal(STAGE_6_ARCHITECTURE.runtime.automaticScheduler, "NOT_CONNECTED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.alwaysOnWorker, "NOT_CONNECTED");
  assert.equal(
    STAGE_6_ARCHITECTURE.runtime.externalQueueProvider,
    "NOT_CONFIGURED",
  );
  assert.equal(paymentProvider().kind, "NOT_CONFIGURED");
  checks += 4;

  const paymentProviderFixture = new DeterministicPaymentProvider(
    "gate6c-staging-webhook-secret-with-safe-entropy",
  );
  paymentProviderFixture.configureDefaultScenario("TRANSIENT_FAILURE");
  const attemptProviderReferences: string[] = [];
  const originalCreate =
    paymentProviderFixture.createPayment.bind(paymentProviderFixture);
  paymentProviderFixture.createPayment = async (input) => {
    attemptProviderReferences.push(input.providerRequestReference);
    return originalCreate(input);
  };
  const refundProviderReferences: string[] = [];
  paymentProviderFixture.refundPayment = async (input) => {
    refundProviderReferences.push(input.providerRequestReference);
    return {
      outcome: "TRANSIENT_FAILURE",
      safeCode: "TEMPORARY_UNAVAILABLE",
    };
  };
  setPaymentProviderForTests(paymentProviderFixture);
  setCommunicationTestProviderFactory(
    (channel) => new DeterministicSinkProvider(channel),
  );
  setCommunicationTestPushEndpointResolver(
    (personIds) =>
      new Map(
        personIds.map((personId) => [
          personId,
          `gate6c-push:${personId}`,
        ]),
      ),
  );

  phase = "SAFE_STATUS";
  const status = await communicationsPaymentAutomationStatus(context);
  assert.equal(status.paymentProvider, "DETERMINISTIC_TEST");
  assert.equal(status.jobTypes.length, 10);
  assert.equal(status.scheduleKeys.length, 5);
  assert.equal(status.payoutConnected, false);
  assert.equal(status.humanDeliveryClaim, false);
  assert.doesNotMatch(
    JSON.stringify(status),
    /password|secret|token|authorization|postgres(?:ql)?:\/\//iu,
  );
  checks += 6;

  phase = "DISABLED_SCHEDULES";
  const schedules = await prisma.platformJobSchedule.findMany({
    where: { id: { in: Object.values(ids.schedules) } },
    orderBy: { id: "asc" },
  });
  assert.equal(schedules.length, 5);
  assert.ok(schedules.every((schedule) => !schedule.enabled));
  checks += 2;

  phase = "WEBHOOK_BOUNDARY";
  const webhookIntent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: paymentsGate5cFixtureIds.intentIds[3] },
  });
  assert.ok(webhookIntent.providerReference);
  const receivedAt = new Date();
  const externalEventId =
    `${COMMUNICATIONS_PAYMENT_GATE6C_MARKER}-webhook`;
  const signed = paymentProviderFixture.signWebhook({
    amount: webhookIntent.amount.toFixed(3),
    currency: "IQD",
    eventId: externalEventId,
    occurredAt: receivedAt,
    outcome: "CAPTURED",
    providerReference: webhookIntent.providerReference!,
    safeCode: null,
  }, receivedAt);
  const beforeInvalid = {
    events: await prisma.paymentProviderEvent.count(),
    jobs: await prisma.platformJob.count(),
  };
  await assert.rejects(
    processPaymentProviderWebhook({
      ...signed,
      receivedAt,
      signature: "0".repeat(64),
    }),
    paymentCode("WEBHOOK_INVALID_SIGNATURE"),
  );
  assert.deepEqual({
    events: await prisma.paymentProviderEvent.count(),
    jobs: await prisma.platformJob.count(),
  }, beforeInvalid);
  const accepted = await processPaymentProviderWebhook({
    ...signed,
    receivedAt,
  });
  const replay = await processPaymentProviderWebhook({
    ...signed,
    receivedAt,
  });
  assert.equal(accepted.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.jobId, accepted.jobId);
  const changed = paymentProviderFixture.signWebhook({
    amount: webhookIntent.amount.minus(1).toFixed(3),
    currency: "IQD",
    eventId: externalEventId,
    occurredAt: receivedAt,
    outcome: "CAPTURED",
    providerReference: webhookIntent.providerReference!,
    safeCode: null,
  }, receivedAt);
  await assert.rejects(
    processPaymentProviderWebhook({
      ...changed,
      receivedAt,
    }),
    paymentCode("IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(await prisma.paymentProviderEvent.count({
    where: { providerEventId: externalEventId },
  }), 1);
  assert.equal(await prisma.platformJob.count({
    where: { providerEvent: { providerEventId: externalEventId } },
  }), 1);
  checks += 8;

  phase = "BOUNDED_WORKER";
  const workerRuns = await runUntilIdle(context);
  assert.ok(workerRuns > 0);
  await triggerGate6CAutomation(context, {
    batchSize: 10,
    idempotencyKey: randomUUID(),
    jobType: "COMMUNICATION_DELIVERY_DISCOVERY",
  });
  await triggerGate6CAutomation(context, {
    batchSize: 10,
    idempotencyKey: randomUUID(),
    jobType: "PAYMENT_RECONCILIATION",
  });
  await triggerGate6CAutomation(context, {
    batchSize: 10,
    idempotencyKey: randomUUID(),
    jobType: "SETTLEMENT_STATEMENT_GENERATE",
  });
  await runUntilIdle(context);
  checks += 2;

  phase = "COMMUNICATION_ASSERTIONS";
  const [dueCampaign, inAppCampaign, directDelivery, cancelledChildren] =
    await Promise.all([
      prisma.communicationCampaign.findUniqueOrThrow({
        where: { id: ids.campaigns.due },
        include: { deliveries: { include: { attempts: true } } },
      }),
      prisma.communicationCampaign.findUniqueOrThrow({
        where: { id: ids.campaigns.inApp },
      }),
      prisma.outboundDelivery.findUniqueOrThrow({
        where: { id: ids.delivery },
        include: { attempts: true },
      }),
      prisma.platformJob.count({
        where: {
          jobType: "COMMUNICATION_CAMPAIGN_DISPATCH",
          payload: {
            equals: {
              campaignId: ids.campaigns.cancelled,
              expectedVersion: 1,
            },
          },
        },
      }),
    ]);
  assert.equal(cancelledChildren, 0);
  assert.equal(directDelivery.status, "ACCEPTED");
  assert.equal(directDelivery.attempts.length, 1);
  assert.equal(directDelivery.attempts[0]?.outcome, "ACCEPTED");
  assert.equal(
    dueCampaign.deliveries.filter((delivery) => delivery.channel === "EMAIL")
      .length,
    1,
  );
  assert.equal(
    dueCampaign.deliveries.find((delivery) => delivery.channel === "EMAIL")
      ?.status,
    "ACCEPTED",
  );
  assert.ok(dueCampaign.inAppNotificationId);
  assert.ok(inAppCampaign.inAppNotificationId);
  assert.equal(await prisma.notification.count({
    where: {
      id: {
        in: [
          dueCampaign.inAppNotificationId!,
          inAppCampaign.inAppNotificationId!,
        ],
      },
    },
  }), 2);
  checks += 9;

  phase = "PAYMENT_ASSERTIONS";
  const [
    seededEvent,
    webhookEvent,
    retryAttempt,
    retryRefund,
    currentSettlementCount,
  ] = await Promise.all([
    prisma.paymentProviderEvent.findUniqueOrThrow({
      where: { id: ids.providerEvent },
    }),
    prisma.paymentProviderEvent.findFirstOrThrow({
      where: { providerEventId: externalEventId },
    }),
    prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: paymentsGate5cFixtureIds.attemptIds[12] },
    }),
    prisma.paymentRefund.findUniqueOrThrow({
      where: { id: ids.refund },
    }),
    prisma.settlementBatch.count({
      where: {
        organizationId: paymentsGate5cFixtureIds.organizationIds[0],
        periodEnd: closedUtcDay(new Date()),
        periodStart: new Date(
          closedUtcDay(new Date()).getTime() - 86_400_000,
        ),
        status: "DRAFT",
      },
    }),
  ]);
  assert.equal(seededEvent.status, "IGNORED");
  assert.equal(webhookEvent.status, "IGNORED");
  assert.equal(retryAttempt.status, "FAILED");
  assert.equal(retryRefund.status, "FAILED");
  assert.equal(retryAttempt.retryable, true);
  assert.equal(retryRefund.retryable, true);
  assert.equal(attemptProviderReferences.length, 1);
  assert.equal(
    attemptProviderReferences[0],
    retryAttempt.providerRequestReference,
  );
  assert.equal(refundProviderReferences.length, 1);
  assert.equal(
    refundProviderReferences[0],
    retryRefund.providerRequestReference,
  );
  assert.equal(await prisma.financialJournal.count({
    where: {
      sourceId: {
        in: [
          ids.providerEvent,
          webhookEvent.id,
          paymentsGate5cFixtureIds.attemptIds[12]!,
          ids.refund,
        ],
      },
    },
  }), 0);
  assert.equal(currentSettlementCount, 0);
  assert.equal(await prisma.settlementBatch.count({
    where: {
      organizationId: paymentsGate5cFixtureIds.organizationIds[0],
      periodEnd: closedUtcDay(new Date()),
      status: { not: "DRAFT" },
    },
  }), 0);
  checks += 11;

  phase = "REDACTION_AND_DEDUPE";
  const gate6cJobs = await prisma.platformJob.findMany({
    where: {
      jobType: {
        in: [
          "COMMUNICATION_CAMPAIGN_DISCOVERY",
          "COMMUNICATION_DELIVERY_DISCOVERY",
          "COMMUNICATION_CAMPAIGN_DISPATCH",
          "COMMUNICATION_DELIVERY_DISPATCH",
          "PAYMENT_PROVIDER_EVENT_PROCESS",
          "PAYMENT_RETRY_DISCOVERY",
          "PAYMENT_ATTEMPT_RETRY",
          "PAYMENT_REFUND_RETRY",
          "PAYMENT_RECONCILIATION",
          "SETTLEMENT_STATEMENT_GENERATE",
        ],
      },
      OR: [
        { createdByAdminUserId: ids.adminUserId },
        {
          providerEvent: {
            providerEventId: {
              startsWith: COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
            },
          },
        },
      ],
    },
    select: {
      createdByAdminUserId: true,
      createdByPersonId: true,
      deduplicationKey: true,
      jobType: true,
      payload: true,
      providerEventId: true,
      resultMetadata: true,
      source: true,
    },
  });
  const serializedJobs = JSON.stringify(gate6cJobs);
  assert.doesNotMatch(
    serializedJobs,
    /@stage4c|\+964|safe synthetic|محتوى|push:|password|secret|signature|authorization|iban|cvv|pan/iu,
  );
  assert.doesNotMatch(serializedJobs, /delivered|human_delivery/iu);
  const providerJobs = gate6cJobs.filter(
    (job) => job.source === "PROVIDER_EVENT",
  );
  assert.ok(
    providerJobs.every(
      (job) =>
        job.createdByAdminUserId === null
        && job.createdByPersonId === null
        && job.providerEventId,
    ),
  );
  const duplicateKeys = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM (
      SELECT "jobType", "scopeKey", "deduplicationKey"
      FROM "PlatformJob"
      GROUP BY "jobType", "scopeKey", "deduplicationKey"
      HAVING count(*) > 1
    ) AS duplicates
  `;
  assert.equal(duplicateKeys[0]?.count, BigInt(0));
  assert.equal(await prisma.platformJob.count({
    where: {
      jobType: "SETTLEMENT_STATEMENT_GENERATE",
      status: "SUCCEEDED",
    },
  }) >= 2, true);
  checks += 5;

  phase = "FINAL_EVIDENCE";
  const finalEvidence =
    await communicationsPaymentGate6cFixtureFingerprint(prisma);
  console.log(JSON.stringify({
    ...safety,
    checks,
    fixture: COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
    initialFixtureEvidence: seeded.fixture,
    settlementEvidence: seeded.settlementEvidence,
    finalFixtureEvidence: finalEvidence,
    humanDeliveryClaimed: false,
    payoutConnected: false,
    providerAcceptanceMeaning: "PROVIDER_ACCEPTANCE_ONLY",
    runtime: STAGE_6_ARCHITECTURE.runtime,
    status: "passed",
    workerRuns,
  }));
}

async function runUntilIdle(context: PlatformJobAdminContext) {
  let executions = 0;
  for (let index = 0; index < 12; index += 1) {
    const run = await runPlatformWorkerBatch(context, {
      batchSize: 10,
      idempotencyKey: randomUUID(),
    });
    executions += 1;
    if (run.state !== "COMPLETE") {
      throw new Error("Gate 6C worker operation did not complete.");
    }
    if (run.claimed === 0) return executions;
  }
  throw new Error("Gate 6C staging work did not converge within its bound.");
}

function paymentCode(expected: string) {
  return (error: unknown) =>
    error instanceof PaymentDomainError && error.code === expected;
}

function closedUtcDay(now: Date) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 6C staging smoke failed closed at ${phase}.`);
  })
  .finally(async () => {
    setCommunicationTestProviderFactory(undefined);
    setCommunicationTestPushEndpointResolver(undefined);
    setPaymentProviderForTests(null);
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
