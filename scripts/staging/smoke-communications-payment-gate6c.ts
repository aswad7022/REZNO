import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Client } from "pg";

import {
  DeterministicSinkProvider,
  setCommunicationTestProviderFactory,
  type OutboundProvider,
} from "../../features/communications/providers/provider";
import {
  CommunicationOperationRetryableError,
} from "../../features/communications/domain/errors";
import type {
  CommerceAdminContext,
} from "../../features/commerce/services/authorization";
import { setCommunicationTestPushEndpointResolver } from "../../features/communications/services/endpoints";
import {
  processExactDeliveryForAutomation,
  setDeliveryAutomationTestHook,
} from "../../features/communications/services/dispatcher";
import {
  communicationsPaymentAutomationStatus,
  triggerGate6CAutomation,
} from "../../features/communications-payment-automation/services/admin";
import {
  PaymentDomainError,
  PaymentOperationRetryableError,
} from "../../features/payments/domain/errors";
import { DeterministicPaymentProvider } from "../../features/payments/providers/deterministic";
import {
  paymentProvider,
  setPaymentProviderForTests,
} from "../../features/payments/providers/registry";
import {
  processPaymentProviderWebhook,
  processVerifiedPaymentProviderEvent,
  type PaymentExecutionGuard,
} from "../../features/payments/services/provider-events";
import {
  retryPaymentAttemptFromAutomation,
  setPaymentAttemptRetryTestHook,
} from "../../features/payments/services/payment-intents";
import {
  requestAdminRefund,
  retryAdminRefund,
  setRefundRetryTestHook,
} from "../../features/payments/services/refunds";
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
    select: { id: true, permissions: true },
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
  let revokeAttemptDuringProvider = false;
  let attemptAuthorityRevoked = false;
  const originalCreate =
    paymentProviderFixture.createPayment.bind(paymentProviderFixture);
  paymentProviderFixture.createPayment = async (input) => {
    attemptProviderReferences.push(input.providerRequestReference);
    const result = await originalCreate(input);
    if (revokeAttemptDuringProvider) attemptAuthorityRevoked = true;
    return result;
  };
  const refundProviderReferences: string[] = [];
  let revokeRefundDuringProvider = false;
  let refundAuthorityRevoked = false;
  paymentProviderFixture.refundPayment = async (input) => {
    refundProviderReferences.push(input.providerRequestReference);
    if (revokeRefundDuringProvider) refundAuthorityRevoked = true;
    return {
      outcome: "TRANSIENT_FAILURE",
      safeCode: "TEMPORARY_UNAVAILABLE",
    };
  };
  const deliveryProviderKeys: string[] = [];
  let deliveryProviderCalls = 0;
  let revokeDeliveryDuringProvider = false;
  let deliveryAuthorityRevoked = false;
  setPaymentProviderForTests(paymentProviderFixture);
  setCommunicationTestProviderFactory((channel): OutboundProvider => {
    const provider = new DeterministicSinkProvider(channel);
    return {
      channel,
      send: async (message) => {
        deliveryProviderCalls += 1;
        deliveryProviderKeys.push(message.providerIdempotencyKey);
        const result = await provider.send(message);
        if (revokeDeliveryDuringProvider) deliveryAuthorityRevoked = true;
        return result;
      },
    };
  });
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

  phase = "DURABILITY_CLOSURE";
  checks += await runDurabilityClosure({
    attemptProviderReferences,
    context: {
      ...context,
      isSuperAdmin: false,
      permissions:
        adminAccess.permissions as CommerceAdminContext["permissions"],
    },
    deliveryProviderKeys,
    getAttemptAuthorityRevoked: () => attemptAuthorityRevoked,
    getDeliveryAuthorityRevoked: () => deliveryAuthorityRevoked,
    getDeliveryProviderCalls: () => deliveryProviderCalls,
    getRefundAuthorityRevoked: () => refundAuthorityRevoked,
    refundProviderReferences,
    setAttemptRevocation: (enabled) => {
      revokeAttemptDuringProvider = enabled;
      attemptAuthorityRevoked = false;
    },
    setDeliveryRevocation: (enabled) => {
      revokeDeliveryDuringProvider = enabled;
      deliveryAuthorityRevoked = false;
    },
    setRefundRevocation: (enabled) => {
      revokeRefundDuringProvider = enabled;
      refundAuthorityRevoked = false;
    },
  });
  attemptProviderReferences.length = 0;
  deliveryProviderCalls = 0;
  deliveryProviderKeys.length = 0;
  refundProviderReferences.length = 0;

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

async function runDurabilityClosure(input: {
  attemptProviderReferences: string[];
  context: CommerceAdminContext;
  deliveryProviderKeys: string[];
  getAttemptAuthorityRevoked: () => boolean;
  getDeliveryAuthorityRevoked: () => boolean;
  getDeliveryProviderCalls: () => number;
  getRefundAuthorityRevoked: () => boolean;
  refundProviderReferences: string[];
  setAttemptRevocation: (enabled: boolean) => void;
  setDeliveryRevocation: (enabled: boolean) => void;
  setRefundRevocation: (enabled: boolean) => void;
}) {
  const attemptId = paymentsGate5cFixtureIds.attemptIds[12]!;
  const attempt = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  const attemptIntent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: attempt.paymentIntentId },
  });
  const refund = await prisma.paymentRefund.findUniqueOrThrow({
    where: { id: ids.refund },
  });
  const refundIntent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: refund.paymentIntentId },
  });
  const delivery = await prisma.outboundDelivery.findUniqueOrThrow({
    where: { id: ids.delivery },
  });
  const deliveryCampaign = await prisma.communicationCampaign.findUniqueOrThrow({
    where: { id: delivery.campaignId },
  });
  const mutationKeys: string[] = [];
  const journalCount = await prisma.financialJournal.count();
  let checks = 0;

  const restoreAttempt = async () => {
    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          actionExpiresAt: attempt.actionExpiresAt,
          actionReference: attempt.actionReference,
          claimedBy: attempt.claimedBy,
          claimExpiresAt: attempt.claimExpiresAt,
          finishedAt: attempt.finishedAt,
          nextRetryAt: attempt.nextRetryAt,
          providerPaymentReference: attempt.providerPaymentReference,
          requiresAction: attempt.requiresAction,
          retryable: attempt.retryable,
          retryCount: attempt.retryCount,
          safeProviderCode: attempt.safeProviderCode,
          startedAt: attempt.startedAt,
          status: attempt.status,
          updatedAt: attempt.updatedAt,
          version: attempt.version,
        },
      }),
      prisma.paymentIntent.update({
        where: { id: attemptIntent.id },
        data: {
          failedAt: attemptIntent.failedAt,
          status: attemptIntent.status,
          updatedAt: attemptIntent.updatedAt,
          version: attemptIntent.version,
        },
      }),
    ]);
  };
  const restoreRefund = async () => {
    await prisma.$transaction([
      prisma.paymentMutation.deleteMany({
        where: { idempotencyKey: { in: mutationKeys } },
      }),
      prisma.adminAuditLog.deleteMany({
        where: {
          adminUserId: ids.adminUserId,
          idempotencyKey: { in: mutationKeys },
        },
      }),
      prisma.paymentRefund.update({
        where: { id: refund.id },
        data: {
          claimedBy: refund.claimedBy,
          claimExpiresAt: refund.claimExpiresAt,
          completedAt: refund.completedAt,
          nextRetryAt: refund.nextRetryAt,
          providerReference: refund.providerReference,
          retryable: refund.retryable,
          retryCount: refund.retryCount,
          safeProviderCode: refund.safeProviderCode,
          status: refund.status,
          updatedAt: refund.updatedAt,
          version: refund.version,
        },
      }),
      prisma.paymentIntent.update({
        where: { id: refundIntent.id },
        data: {
          refundedAmount: refundIntent.refundedAmount,
          status: refundIntent.status,
          updatedAt: refundIntent.updatedAt,
          version: refundIntent.version,
        },
      }),
    ]);
  };
  const restoreDelivery = async () => {
    await prisma.$transaction([
      prisma.outboundDeliveryAttempt.deleteMany({
        where: { deliveryId: delivery.id },
      }),
      prisma.outboundDelivery.update({
        where: { id: delivery.id },
        data: {
          acceptedAt: delivery.acceptedAt,
          attemptCount: delivery.attemptCount,
          claimedAt: delivery.claimedAt,
          claimExpiresAt: delivery.claimExpiresAt,
          claimOwner: delivery.claimOwner,
          failedAt: delivery.failedAt,
          lastProviderCode: delivery.lastProviderCode,
          nextAttemptAt: delivery.nextAttemptAt,
          status: delivery.status,
          suppressionReason: delivery.suppressionReason,
          updatedAt: delivery.updatedAt,
          version: delivery.version,
        },
      }),
      prisma.communicationCampaign.update({
        where: { id: deliveryCampaign.id },
        data: {
          completedAt: deliveryCampaign.completedAt,
          status: deliveryCampaign.status,
          updatedAt: deliveryCampaign.updatedAt,
          version: deliveryCampaign.version,
        },
      }),
    ]);
  };

  try {
    phase = "DURABILITY_ATTEMPT_CLAIM";
    const dueAttempt = await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: attempt.retryCount,
      },
    });
    const attemptJob = randomUUID();
    setPaymentAttemptRetryTestHook(({ phase }) => {
      if (phase === "AFTER_CLAIM_BEFORE_PROVIDER") {
        throw new Error("Gate 6C staging attempt interruption.");
      }
    });
    await assert.rejects(retryPaymentAttemptFromAutomation(input.context, {
      attemptId: dueAttempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: dueAttempt.version,
      jobId: attemptJob,
    }));
    await assert.rejects(
      retryPaymentAttemptFromAutomation(input.context, {
        attemptId: dueAttempt.id,
        executionGuard: noPaymentGuard,
        expectedVersion: dueAttempt.version,
        jobId: attemptJob,
      }),
      retryablePaymentOperation,
    );
    await assert.rejects(
      retryPaymentAttemptFromAutomation(input.context, {
        attemptId: dueAttempt.id,
        executionGuard: noPaymentGuard,
        expectedVersion: dueAttempt.version + 10,
        jobId: randomUUID(),
      }),
      retryablePaymentOperation,
    );
    await prisma.paymentAttempt.update({
      where: { id: dueAttempt.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setPaymentAttemptRetryTestHook(undefined);
    await retryPaymentAttemptFromAutomation(input.context, {
      attemptId: dueAttempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: dueAttempt.version,
      jobId: attemptJob,
    });
    let currentAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: dueAttempt.id },
    });
    assert.equal(currentAttempt.status, "FAILED");
    assert.equal(currentAttempt.claimedBy, null);
    assert.equal(
      currentAttempt.providerRequestReference,
      attempt.providerRequestReference,
    );
    checks += 6;

    phase = "DURABILITY_ATTEMPT_PROVIDER";
    currentAttempt = await prisma.paymentAttempt.update({
      where: { id: dueAttempt.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: attempt.retryCount,
      },
    });
    const uncertainAttemptJob = randomUUID();
    const attemptCallsBeforeUncertainty = input.attemptProviderReferences.length;
    let injectedAttemptGeneration:
      | Awaited<ReturnType<typeof injectClaimGeneration>>
      | undefined;
    setPaymentAttemptRetryTestHook(async ({ phase }) => {
      if (phase !== "AFTER_PROVIDER_BEFORE_APPLY") return;
      injectedAttemptGeneration = await injectClaimGeneration(
        "PAYMENT_ATTEMPT",
        currentAttempt.id,
        `platform-job:${uncertainAttemptJob}`,
      );
    });
    let staleAttemptGuardCalls = 0;
    await assert.rejects(
      retryPaymentAttemptFromAutomation(input.context, {
        attemptId: currentAttempt.id,
        executionGuard: async () => {
          staleAttemptGuardCalls += 1;
          if (staleAttemptGuardCalls >= 3) {
            throw new Error("Gate 6C staging stale attempt generation.");
          }
        },
        expectedVersion: currentAttempt.version,
        jobId: uncertainAttemptJob,
      }),
      /stale attempt generation/u,
    );
    assert.ok(injectedAttemptGeneration);
    const secondAttemptClaim = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: currentAttempt.id },
    });
    assert.equal(
      secondAttemptClaim.version,
      injectedAttemptGeneration.currentGeneration,
    );
    assert.ok(
      secondAttemptClaim.version
        > injectedAttemptGeneration.previousGeneration,
    );
    assert.equal(secondAttemptClaim.status, "PROCESSING");
    const afterStaleAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: currentAttempt.id },
    });
    assert.equal(afterStaleAttempt.version, secondAttemptClaim.version);
    assert.equal(afterStaleAttempt.status, "PROCESSING");
    assert.equal(
      afterStaleAttempt.claimedBy,
      `platform-job:${uncertainAttemptJob}`,
    );
    await prisma.paymentAttempt.update({
      where: { id: currentAttempt.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setPaymentAttemptRetryTestHook(undefined);
    await retryPaymentAttemptFromAutomation(input.context, {
      attemptId: currentAttempt.id,
      executionGuard: noPaymentGuard,
      expectedVersion: currentAttempt.version,
      jobId: uncertainAttemptJob,
    });
    assert.equal(
      input.attemptProviderReferences.slice(attemptCallsBeforeUncertainty)
        .every((reference) => reference === attempt.providerRequestReference),
      true,
    );
    assert.equal(
      input.attemptProviderReferences.length - attemptCallsBeforeUncertainty,
      2,
    );
    checks += 7;

    phase = "DURABILITY_ATTEMPT_REVOCATION";
    currentAttempt = await prisma.paymentAttempt.update({
      where: { id: currentAttempt.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: attempt.retryCount,
      },
    });
    let attemptGuardCalls = 0;
    const revokedAfterClaimGuard: PaymentExecutionGuard = async () => {
      attemptGuardCalls += 1;
      if (attemptGuardCalls > 1) {
        throw new Error("Gate 6C staging attempt authority revoked.");
      }
    };
    const callsBeforeAttemptRevocation = input.attemptProviderReferences.length;
    await assert.rejects(retryPaymentAttemptFromAutomation(input.context, {
      attemptId: currentAttempt.id,
      executionGuard: revokedAfterClaimGuard,
      expectedVersion: currentAttempt.version,
      jobId: randomUUID(),
    }));
    assert.equal(
      input.attemptProviderReferences.length,
      callsBeforeAttemptRevocation,
    );
    currentAttempt = await prisma.paymentAttempt.update({
      where: { id: currentAttempt.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: attempt.retryCount,
      },
    });
    input.setAttemptRevocation(true);
    await assert.rejects(retryPaymentAttemptFromAutomation(input.context, {
      attemptId: currentAttempt.id,
      executionGuard: async () => {
        if (input.getAttemptAuthorityRevoked()) {
          throw new Error("Gate 6C staging attempt provider authority revoked.");
        }
      },
      expectedVersion: currentAttempt.version,
      jobId: randomUUID(),
    }));
    input.setAttemptRevocation(false);
    assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: currentAttempt.id },
    })).status, "FAILED");
    checks += 3;
    await restoreAttempt();

    phase = "DURABILITY_REFUND_CAPACITY";
    const capacityCalls = input.refundProviderReferences.length;
    await assert.rejects(
      requestAdminRefund(input.context, {
        amount: refundIntent.capturedAmount
          .minus(refundIntent.refundedAmount)
          .toFixed(3),
        expectedVersion: refundIntent.version,
        idempotencyKey: randomUUID(),
        paymentIntentId: refundIntent.id,
        reasonCode: "ADMIN_CORRECTION",
      }),
      paymentCode("REFUND_AMOUNT_EXCEEDED"),
    );
    assert.equal(input.refundProviderReferences.length, capacityCalls);
    const concurrentRefund = await prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: refund.retryCount,
      },
    });
    const concurrentJob = randomUUID();
    mutationKeys.push(concurrentJob);
    const capacityRace = await Promise.allSettled([
      retryAdminRefund(input.context, concurrentRefund.id, {
        expectedVersion: concurrentRefund.version,
        idempotencyKey: concurrentJob,
      }, noPaymentGuard, {
        claimOwner: `platform-job:${concurrentJob}`,
        requireRetryable: true,
      }),
      requestAdminRefund(input.context, {
        amount: refundIntent.capturedAmount
          .minus(refundIntent.refundedAmount)
          .toFixed(3),
        expectedVersion: refundIntent.version,
        idempotencyKey: randomUUID(),
        paymentIntentId: refundIntent.id,
        reasonCode: "ADMIN_CORRECTION",
      }),
    ]);
    assert.equal(
      capacityRace.filter((result) => result.status === "fulfilled").length,
      1,
    );
    checks += 3;

    phase = "DURABILITY_REFUND_CLAIM";
    let currentRefund = await prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: refund.retryCount,
      },
    });
    const refundJob = randomUUID();
    mutationKeys.push(refundJob);
    setRefundRetryTestHook(({ phase }) => {
      if (phase === "AFTER_CLAIM_BEFORE_PROVIDER") {
        throw new Error("Gate 6C staging refund interruption.");
      }
    });
    await assert.rejects(retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: refundJob,
    }, noPaymentGuard, {
      claimOwner: `platform-job:${refundJob}`,
      requireRetryable: true,
    }));
    await assert.rejects(retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: refundJob,
    }, noPaymentGuard, {
      claimOwner: `platform-job:${refundJob}`,
      requireRetryable: true,
    }), retryablePaymentOperation);
    const foreignRefundJob = randomUUID();
    await assert.rejects(retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: foreignRefundJob,
    }, noPaymentGuard, {
      claimOwner: `platform-job:${foreignRefundJob}`,
      requireRetryable: true,
    }), retryablePaymentOperation);
    await prisma.paymentRefund.update({
      where: { id: currentRefund.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setRefundRetryTestHook(undefined);
    await retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: refundJob,
    }, noPaymentGuard, {
      claimOwner: `platform-job:${refundJob}`,
      requireRetryable: true,
    });
    checks += 4;

    phase = "DURABILITY_REFUND_PROVIDER";
    currentRefund = await prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: refund.retryCount,
      },
    });
    const uncertainRefundJob = randomUUID();
    mutationKeys.push(uncertainRefundJob);
    const refundCallsBeforeUncertainty = input.refundProviderReferences.length;
    let injectedRefundGeneration:
      | Awaited<ReturnType<typeof injectClaimGeneration>>
      | undefined;
    setRefundRetryTestHook(async ({ phase }) => {
      if (phase !== "AFTER_PROVIDER_BEFORE_APPLY") return;
      injectedRefundGeneration = await injectClaimGeneration(
        "PAYMENT_REFUND",
        currentRefund.id,
        `platform-job:${uncertainRefundJob}`,
      );
    });
    let staleRefundGuardCalls = 0;
    await assert.rejects(
      retryAdminRefund(input.context, currentRefund.id, {
        expectedVersion: currentRefund.version,
        idempotencyKey: uncertainRefundJob,
      }, async () => {
        staleRefundGuardCalls += 1;
        if (staleRefundGuardCalls >= 3) {
          throw new Error("Gate 6C staging stale refund generation.");
        }
      }, {
        claimOwner: `platform-job:${uncertainRefundJob}`,
        requireRetryable: true,
      }),
      /stale refund generation/u,
    );
    assert.ok(injectedRefundGeneration);
    const secondRefundClaim = await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: currentRefund.id },
    });
    assert.equal(
      secondRefundClaim.version,
      injectedRefundGeneration.currentGeneration,
    );
    assert.ok(
      secondRefundClaim.version
        > injectedRefundGeneration.previousGeneration,
    );
    assert.equal(secondRefundClaim.status, "PROCESSING");
    const afterStaleRefund = await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: currentRefund.id },
    });
    assert.equal(afterStaleRefund.version, secondRefundClaim.version);
    assert.equal(afterStaleRefund.status, "PROCESSING");
    assert.equal(
      afterStaleRefund.claimedBy,
      `platform-job:${uncertainRefundJob}`,
    );
    assert.equal(
      (
        await prisma.paymentMutation.findUniqueOrThrow({
          where: {
            actorKey_idempotencyKey: {
              actorKey: `admin:${input.context.userId}`,
              idempotencyKey: uncertainRefundJob,
            },
          },
        })
      ).status,
      "PROCESSING",
    );
    await prisma.paymentRefund.update({
      where: { id: currentRefund.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setRefundRetryTestHook(undefined);
    await retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: uncertainRefundJob,
    }, noPaymentGuard, {
      claimOwner: `platform-job:${uncertainRefundJob}`,
      requireRetryable: true,
    });
    assert.equal(
      input.refundProviderReferences.slice(refundCallsBeforeUncertainty)
        .every((reference) => reference === refund.providerRequestReference),
      true,
    );
    assert.equal(
      input.refundProviderReferences.length - refundCallsBeforeUncertainty,
      2,
    );
    checks += 8;

    phase = "DURABILITY_REFUND_REVOCATION_AFTER_CLAIM";
    currentRefund = await prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: refund.retryCount,
      },
    });
    let refundGuardCalls = 0;
    const refundClaimGuard: PaymentExecutionGuard = async () => {
      refundGuardCalls += 1;
      if (refundGuardCalls > 1) {
        throw new Error("Gate 6C staging refund authority revoked.");
      }
    };
    const refundClaimJob = randomUUID();
    mutationKeys.push(refundClaimJob);
    const callsBeforeRefundRevocation = input.refundProviderReferences.length;
    await assert.rejects(retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: refundClaimJob,
    }, refundClaimGuard, {
      claimOwner: `platform-job:${refundClaimJob}`,
      requireRetryable: true,
    }));
    assert.equal(
      input.refundProviderReferences.length,
      callsBeforeRefundRevocation,
    );
    phase = "DURABILITY_REFUND_REVOCATION_DURING_PROVIDER";
    currentRefund = await prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        nextRetryAt: new Date(Date.now() - 1_000),
        retryable: true,
        retryCount: refund.retryCount,
      },
    });
    const refundProviderJob = randomUUID();
    mutationKeys.push(refundProviderJob);
    input.setRefundRevocation(true);
    await assert.rejects(retryAdminRefund(input.context, currentRefund.id, {
      expectedVersion: currentRefund.version,
      idempotencyKey: refundProviderJob,
    }, async () => {
      if (input.getRefundAuthorityRevoked()) {
        throw new Error("Gate 6C staging refund provider authority revoked.");
      }
    }, {
      claimOwner: `platform-job:${refundProviderJob}`,
      requireRetryable: true,
    }));
    input.setRefundRevocation(false);
    phase = "DURABILITY_REFUND_REVOCATION_STATE";
    assert.equal((await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: currentRefund.id },
    })).status, "FAILED");
    phase = "DURABILITY_REFUND_REVOCATION_MUTATION";
    assert.equal(await prisma.paymentMutation.count({
      where: {
        idempotencyKey: { in: mutationKeys },
        status: "PROCESSING",
      },
    }), 0);
    checks += 4;
    await restoreRefund();

    phase = "DURABILITY_DELIVERY_CLAIM";
    setDeliveryAutomationTestHook(({ phase }) => {
      if (phase === "AFTER_CLAIM_BEFORE_ATTEMPT") {
        throw new Error("Gate 6C staging delivery claim interruption.");
      }
    });
    const deliveryOwner = `platform-job:${randomUUID()}`;
    await assert.rejects(processExactDeliveryForAutomation({
      claimOwner: deliveryOwner,
      deliveryId: delivery.id,
      executionGuard: noCommunicationGuard,
      expectedVersion: delivery.version,
    }));
    await assert.rejects(processExactDeliveryForAutomation({
      claimOwner: deliveryOwner,
      deliveryId: delivery.id,
      executionGuard: noCommunicationGuard,
      expectedVersion: delivery.version,
    }), retryableCommunicationOperation);
    await prisma.outboundDelivery.update({
      where: { id: delivery.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setDeliveryAutomationTestHook(undefined);
    await processExactDeliveryForAutomation({
      claimOwner: deliveryOwner,
      deliveryId: delivery.id,
      executionGuard: noCommunicationGuard,
      expectedVersion: delivery.version,
    });
    checks += 3;
    await restoreDelivery();

    phase = "DURABILITY_DELIVERY_ATTEMPT";
    setDeliveryAutomationTestHook(({ phase }) => {
      if (phase === "AFTER_ATTEMPT_BEFORE_PROVIDER") {
        throw new Error("Gate 6C staging delivery attempt interruption.");
      }
    });
    const attemptDeliveryOwner = `platform-job:${randomUUID()}`;
    phase = "DURABILITY_DELIVERY_ATTEMPT_INTERRUPT";
    await assert.rejects(processExactDeliveryForAutomation({
      claimOwner: attemptDeliveryOwner,
      deliveryId: delivery.id,
      executionGuard: noCommunicationGuard,
      expectedVersion: delivery.version,
    }));
    phase = "DURABILITY_DELIVERY_ATTEMPT_UNFINISHED";
    const unfinishedAttempt =
      await prisma.outboundDeliveryAttempt.findFirstOrThrow({
        where: { deliveryId: delivery.id },
      });
    phase = "DURABILITY_DELIVERY_ATTEMPT_EXPIRE";
    await prisma.outboundDelivery.update({
      where: { id: delivery.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setDeliveryAutomationTestHook(undefined);
    phase = "DURABILITY_DELIVERY_ATTEMPT_RECOVER";
    await processExactDeliveryForAutomation({
      claimOwner: attemptDeliveryOwner,
      deliveryId: delivery.id,
      executionGuard: noCommunicationGuard,
      expectedVersion: delivery.version,
    });
    phase = "DURABILITY_DELIVERY_ATTEMPT_VERIFY";
    assert.equal(await prisma.outboundDeliveryAttempt.count({
      where: { deliveryId: delivery.id },
    }), 1);
    assert.equal((await prisma.outboundDeliveryAttempt.findFirstOrThrow({
      where: { deliveryId: delivery.id },
    })).id, unfinishedAttempt.id);
    checks += 3;
    await restoreDelivery();

    phase = "DURABILITY_DELIVERY_PROVIDER";
    const deliveryCallsBeforeUncertainty = input.getDeliveryProviderCalls();
    const deliveryKeysBeforeUncertainty = input.deliveryProviderKeys.length;
    const uncertainDeliveryOwner = `platform-job:${randomUUID()}`;
    let injectedDeliveryGeneration:
      | Awaited<ReturnType<typeof injectClaimGeneration>>
      | undefined;
    setDeliveryAutomationTestHook(async ({ phase }) => {
      if (phase !== "AFTER_PROVIDER_BEFORE_FINALIZE") return;
      injectedDeliveryGeneration = await injectClaimGeneration(
        "OUTBOUND_DELIVERY",
        delivery.id,
        uncertainDeliveryOwner,
      );
    });
    let staleDeliveryGuardCalls = 0;
    await assert.rejects(
      processExactDeliveryForAutomation({
        claimOwner: uncertainDeliveryOwner,
        deliveryId: delivery.id,
        executionGuard: async () => {
          staleDeliveryGuardCalls += 1;
          if (staleDeliveryGuardCalls >= 4) {
            throw new Error("Gate 6C staging stale delivery generation.");
          }
        },
        expectedVersion: delivery.version,
      }),
      /stale delivery generation/u,
    );
    assert.ok(injectedDeliveryGeneration);
    const secondDeliveryClaim = await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    assert.equal(
      secondDeliveryClaim.version,
      injectedDeliveryGeneration.currentGeneration,
    );
    assert.ok(
      secondDeliveryClaim.version
        > injectedDeliveryGeneration.previousGeneration,
    );
    assert.equal(secondDeliveryClaim.status, "CLAIMED");
    const afterStaleDelivery =
      await prisma.outboundDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
    assert.equal(afterStaleDelivery.version, secondDeliveryClaim.version);
    assert.equal(afterStaleDelivery.status, "CLAIMED");
    assert.equal(afterStaleDelivery.claimOwner, uncertainDeliveryOwner);
    assert.equal(await prisma.outboundDeliveryAttempt.count({
      where: { deliveryId: delivery.id, finishedAt: null },
    }), 1);
    await prisma.outboundDelivery.update({
      where: { id: delivery.id },
      data: { claimExpiresAt: new Date(Date.now() - 1_000) },
    });
    setDeliveryAutomationTestHook(undefined);
    await processExactDeliveryForAutomation({
      claimOwner: uncertainDeliveryOwner,
      deliveryId: delivery.id,
      executionGuard: noCommunicationGuard,
      expectedVersion: delivery.version,
    });
    assert.equal(
      input.getDeliveryProviderCalls() - deliveryCallsBeforeUncertainty,
      2,
    );
    assert.equal(
      new Set(input.deliveryProviderKeys.slice(deliveryKeysBeforeUncertainty))
        .size,
      1,
    );
    assert.equal(await prisma.outboundDeliveryAttempt.count({
      where: { deliveryId: delivery.id },
    }), 1);
    checks += 9;
    await restoreDelivery();

    phase = "DURABILITY_DELIVERY_REVOCATION";
    input.setDeliveryRevocation(true);
    await assert.rejects(processExactDeliveryForAutomation({
      claimOwner: `platform-job:${randomUUID()}`,
      deliveryId: delivery.id,
      executionGuard: async () => {
        if (input.getDeliveryAuthorityRevoked()) {
          throw new Error("Gate 6C staging delivery provider authority revoked.");
        }
      },
      expectedVersion: delivery.version,
    }));
    input.setDeliveryRevocation(false);
    assert.equal((await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })).status, "RETRY_SCHEDULED");
    assert.equal(await prisma.outboundDeliveryAttempt.count({
      where: { deliveryId: delivery.id, finishedAt: null },
    }), 0);
    checks += 3;
    await restoreDelivery();

    phase = "DURABILITY_EVENT_RACE";
    const eventIntent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: paymentsGate5cFixtureIds.intentIds[3] },
    });
    const eventAttempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { paymentIntentId: eventIntent.id },
    });
    const eventId = randomUUID();
    const eventNow = new Date();
    const eventJournalCount = await prisma.financialJournal.count({
      where: { paymentIntentId: eventIntent.id, sourceType: "CAPTURE" },
    });
    try {
      await prisma.paymentAttempt.update({
        where: { id: eventAttempt.id },
        data: {
          claimedBy: `platform-job:${randomUUID()}`,
          claimExpiresAt: new Date(Date.now() + 60_000),
          finishedAt: null,
          nextRetryAt: null,
          retryable: null,
          safeProviderCode: null,
          status: "PROCESSING",
          version: { increment: 1 },
        },
      });
      await prisma.paymentProviderEvent.create({
        data: {
          id: eventId,
          normalizedAmount: eventIntent.amount,
          normalizedCurrency: eventIntent.currency,
          normalizedType: "CAPTURED",
          occurredAt: eventNow,
          payloadHash: "a".repeat(64),
          paymentIntentId: eventIntent.id,
          processingVersion: 1,
          provider: eventIntent.provider,
          providerEventId:
            `${COMMUNICATIONS_PAYMENT_GATE6C_MARKER}-durability-event`,
          providerReference: eventIntent.providerReference,
          status: "VERIFIED",
          verifiedAt: eventNow,
        },
      });
      const eventResult = await processVerifiedPaymentProviderEvent({
        eventId,
        executionGuard: noPaymentGuard,
        expectedVersion: 1,
      });
      assert.equal(eventResult.state, "IGNORED");
      const superseded = await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: eventAttempt.id },
      });
      assert.equal(superseded.status, "CANCELLED");
      assert.equal(superseded.claimedBy, null);
      assert.notEqual(superseded.finishedAt, null);
      assert.equal(await prisma.financialJournal.count({
        where: { paymentIntentId: eventIntent.id, sourceType: "CAPTURE" },
      }), eventJournalCount);
      checks += 5;
    } finally {
      await prisma.$transaction([
        prisma.paymentProviderEvent.deleteMany({ where: { id: eventId } }),
        prisma.paymentAttempt.update({
          where: { id: eventAttempt.id },
          data: {
            claimedBy: eventAttempt.claimedBy,
            claimExpiresAt: eventAttempt.claimExpiresAt,
            finishedAt: eventAttempt.finishedAt,
            nextRetryAt: eventAttempt.nextRetryAt,
            retryable: eventAttempt.retryable,
            safeProviderCode: eventAttempt.safeProviderCode,
            status: eventAttempt.status,
            updatedAt: eventAttempt.updatedAt,
            version: eventAttempt.version,
          },
        }),
      ]);
    }
    assert.equal(await prisma.financialJournal.count(), journalCount);
    assert.equal(await prisma.paymentAttempt.count({
      where: { id: attempt.id, status: "PROCESSING" },
    }), 0);
    assert.equal(await prisma.paymentRefund.count({
      where: { id: refund.id, status: "PROCESSING" },
    }), 0);
    assert.equal(await prisma.outboundDelivery.count({
      where: { id: delivery.id, status: "CLAIMED" },
    }), 0);
    assert.equal(await prisma.outboundDeliveryAttempt.count({
      where: { deliveryId: delivery.id, finishedAt: null },
    }), 0);
    checks += 5;
    phase = "DURABILITY_CLOSURE_COMPLETE";
  } finally {
    setDeliveryAutomationTestHook(undefined);
    setPaymentAttemptRetryTestHook(undefined);
    setRefundRetryTestHook(undefined);
    input.setAttemptRevocation(false);
    input.setDeliveryRevocation(false);
    input.setRefundRevocation(false);
    await restoreAttempt();
    await restoreRefund();
    await restoreDelivery();
  }
  return checks;
}

const noPaymentGuard: PaymentExecutionGuard = async () => undefined;
const noCommunicationGuard = async () => undefined;

async function injectClaimGeneration(
  target: "OUTBOUND_DELIVERY" | "PAYMENT_ATTEMPT" | "PAYMENT_REFUND",
  id: string,
  claimOwner: string,
) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Gate 6C claim-generation injection requires DATABASE_URL.");
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = target === "PAYMENT_ATTEMPT"
      ? await client.query<{ version: number }>(
          `UPDATE "PaymentAttempt"
           SET "claimExpiresAt" = clock_timestamp() + interval '1 minute',
               "version" = "version" + 1
           WHERE "id" = $1::uuid
             AND "status" = 'PROCESSING'
             AND "claimedBy" = $2
           RETURNING "version"`,
          [id, claimOwner],
        )
      : target === "PAYMENT_REFUND"
        ? await client.query<{ version: number }>(
            `UPDATE "PaymentRefund"
             SET "claimExpiresAt" = clock_timestamp() + interval '1 minute',
                 "version" = "version" + 1
             WHERE "id" = $1::uuid
               AND "status" = 'PROCESSING'
               AND "claimedBy" = $2
             RETURNING "version"`,
            [id, claimOwner],
          )
        : await client.query<{ version: number }>(
            `UPDATE "OutboundDelivery"
             SET "claimExpiresAt" = clock_timestamp() + interval '1 minute',
                 "version" = "version" + 1
             WHERE "id" = $1::uuid
               AND "status" = 'CLAIMED'
               AND "claimOwner" = $2
             RETURNING "version"`,
            [id, claimOwner],
          );
    const currentGeneration = result.rows[0]?.version;
    if (result.rowCount !== 1 || currentGeneration === undefined) {
      throw new Error(
        "Gate 6C claim-generation injection did not bind one exact active claim.",
      );
    }
    return {
      currentGeneration,
      previousGeneration: currentGeneration - 1,
    };
  } finally {
    await client.end();
  }
}

function retryablePaymentOperation(error: unknown) {
  return error instanceof PaymentOperationRetryableError;
}

function retryableCommunicationOperation(error: unknown) {
  return error instanceof CommunicationOperationRetryableError;
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
