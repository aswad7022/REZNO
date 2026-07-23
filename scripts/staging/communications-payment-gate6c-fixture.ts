import { createHash } from "node:crypto";

import {
  Prisma,
  type PlatformJobScheduleKey,
  type PlatformJobType,
  type PrismaClient,
} from "@prisma/client";

import { platformJobHash } from "../../features/platform-jobs/domain/canonical";
import {
  cleanupPaymentsGate5cFixture,
  paymentsGate5cFixtureIds,
  seedPaymentsGate5cFixture,
} from "./payments-gate5c-fixture";

export const COMMUNICATIONS_PAYMENT_GATE6C_MARKER =
  "rezno-qa-stage6-gate6c-communications-payment";

const baseTime = new Date("2026-07-23T12:00:00.123456Z");
const dueTime = new Date("2026-07-22T12:00:00.123456Z");
const id = (value: number) =>
  `6c000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const communicationsPaymentGate6cFixtureIds = {
  adminPersonId: "4c000000-0000-4000-8000-000000000002",
  adminUserId: "4c000000-0000-4000-8000-000000000001",
  customerPersonId: "4c000000-0000-4000-8000-000000000008",
  organizationId: "4c000000-0000-4000-8000-000000000011",
  campaigns: {
    cancelled: id(101),
    dispatching: id(102),
    due: id(103),
    inApp: id(104),
  },
  delivery: id(201),
  providerEvent: id(301),
  refund: id(302),
  schedules: {
    campaign: id(401),
    delivery: id(402),
    paymentRetry: id(403),
    reconciliation: id(404),
    settlement: id(405),
  },
  jobs: {
    campaign: id(501),
    delivery: id(502),
    paymentRetry: id(503),
    providerEvent: id(504),
    reconciliation: id(505),
    settlement: id(506),
  },
  reconciliationAttempt: id(601),
  reconciliationLease: id(602),
  reconciliationMutation: id(603),
  reconciliationMutationKey: id(604),
} as const;

const gate6cJobTypes = [
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
] as const satisfies readonly PlatformJobType[];

const fullPermissions = [
  "PLATFORM_JOBS_VIEW",
  "PLATFORM_JOBS_MANAGE",
  "NOTIFICATIONS_VIEW",
  "NOTIFICATIONS_SEND",
  "COMMUNICATIONS_DISPATCH",
  "PAYMENTS_VIEW",
  "PAYMENTS_REFUND",
  "PAYMENTS_RECONCILE",
  "SETTLEMENTS_VIEW",
  "SETTLEMENTS_MANAGE",
] as const;

const stage4cPersonIds = [
  "4c000000-0000-4000-8000-000000000002",
  "4c000000-0000-4000-8000-000000000004",
  "4c000000-0000-4000-8000-000000000006",
  "4c000000-0000-4000-8000-000000000008",
  "4c000000-0000-4000-8000-00000000000a",
  "4c000000-0000-4000-8000-00000000000c",
  "4c000000-0000-4000-8000-00000000000e",
  "4c000000-0000-4000-8000-000000000010",
] as const;

export async function seedCommunicationsPaymentGate6cFixture(
  prisma: PrismaClient,
) {
  await cleanupCommunicationsPaymentGate6cFixture(prisma);
  const paymentEvidence = await seedPaymentsGate5cFixture(prisma);
  const ids = communicationsPaymentGate6cFixtureIds;
  const paymentIds = paymentsGate5cFixtureIds;
  const adminAccess = await prisma.adminAccess.findUniqueOrThrow({
    where: { userId: ids.adminUserId },
    select: { id: true },
  });
  const eventIntent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: paymentIds.intentIds[3] },
    select: {
      amount: true,
      currency: true,
      id: true,
      providerReference: true,
    },
  });
  if (!eventIntent.providerReference || eventIntent.currency !== "IQD") {
    throw new Error("Gate 6C fixture payment-event target is not canonical.");
  }

  const completedReconciliation = {
    counts: {
      DATABASE_AHEAD: 0,
      LEDGER_MISMATCH: 0,
      MATCHED: 0,
      MISSING_PROVIDER_RECORD: 0,
      NOT_CONFIGURED: 0,
      PROVIDER_AHEAD: 0,
      TARGET_STATE_MISMATCH: 0,
    },
    kind: "PAYMENT_RECONCILED",
    scanned: 0,
  } as const;

  await prisma.$transaction(async (transaction) => {
    await transaction.adminAccess.update({
      where: { id: adminAccess.id },
      data: { permissions: [...fullPermissions], status: "ACTIVE" },
    });

    await transaction.communicationCampaign.createMany({
      data: [
        campaignRow(ids.campaigns.cancelled, "CANCELLED", ["EMAIL"], {
          cancelledAt: baseTime,
          cancellationReason: "Synthetic Gate 6C cancellation sentinel",
          scheduledAt: dueTime,
        }),
        campaignRow(ids.campaigns.dispatching, "DISPATCHING", ["EMAIL"], {
          dispatchStartedAt: baseTime,
          recipientEvaluationAt: baseTime,
        }),
        campaignRow(ids.campaigns.due, "SCHEDULED", ["IN_APP", "EMAIL"], {
          scheduledAt: dueTime,
        }),
        campaignRow(ids.campaigns.inApp, "SCHEDULED", ["IN_APP"], {
          scheduledAt: dueTime,
        }),
      ],
    });
    await transaction.outboundDelivery.create({
      data: {
        campaignId: ids.campaigns.dispatching,
        channel: "EMAIL",
        createdAt: baseTime,
        endpointFingerprint: sha256(
          "EMAIL:stage4c-verified-customer@stage4c.rezno.invalid",
        ),
        endpointType: "EMAIL",
        id: ids.delivery,
        locale: "EN",
        personId: ids.customerPersonId,
        status: "PENDING",
        updatedAt: baseTime,
        version: 1,
      },
    });

    await transaction.paymentAttempt.update({
      where: { id: paymentIds.attemptIds[12] },
      data: {
        finishedAt: dueTime,
        nextRetryAt: dueTime,
        retryable: true,
        retryCount: 1,
        safeProviderCode: "TEMPORARY_UNAVAILABLE",
        status: "FAILED",
        updatedAt: baseTime,
        version: 2,
      },
    });
    await transaction.paymentRefund.create({
      data: {
        amount: "1000.000",
        createdAt: baseTime,
        currency: "IQD",
        id: ids.refund,
        idempotencyKey: id(701),
        nextRetryAt: dueTime,
        paymentIntentId: paymentIds.intentIds[3]!,
        providerRequestReference: `refund_${ids.refund}`,
        reasonCode: "ADMIN_CORRECTION",
        requestHash: sha256(`${COMMUNICATIONS_PAYMENT_GATE6C_MARKER}:refund`),
        requestedByActorId: ids.adminUserId,
        requestedByActorType: "ADMIN",
        retryable: true,
        retryCount: 1,
        safeProviderCode: "TEMPORARY_UNAVAILABLE",
        status: "FAILED",
        updatedAt: baseTime,
        version: 2,
      },
    });
    await transaction.paymentProviderEvent.create({
      data: {
        createdAt: baseTime,
        id: ids.providerEvent,
        normalizedAmount: eventIntent.amount,
        normalizedCurrency: "IQD",
        normalizedType: "CAPTURED",
        occurredAt: baseTime,
        payloadHash: sha256(
          `${COMMUNICATIONS_PAYMENT_GATE6C_MARKER}:provider-event`,
        ),
        paymentIntentId: eventIntent.id,
        processingVersion: 1,
        provider: "DETERMINISTIC_TEST",
        providerEventId: `${COMMUNICATIONS_PAYMENT_GATE6C_MARKER}-capture`,
        providerReference: eventIntent.providerReference,
        status: "VERIFIED",
        updatedAt: baseTime,
        verifiedAt: baseTime,
      },
    });

    await transaction.$executeRaw(
      Prisma.sql`SET CONSTRAINTS "FinancialJournal_balance_trigger" IMMEDIATE`,
    );
    await transaction.settlementBatch.update({
      where: { id: paymentIds.settlementBatchIds[0] },
      data: {
        periodEnd: new Date("2026-07-20T00:00:00.000Z"),
        periodStart: new Date("2026-07-19T00:00:00.000Z"),
      },
    });
    await transaction.settlementBatch.update({
      where: { id: paymentIds.settlementBatchIds[1] },
      data: {
        periodEnd: new Date("2026-07-19T00:00:00.000Z"),
        periodStart: new Date("2026-07-18T00:00:00.000Z"),
      },
    });
    await transaction.platformJobSchedule.createMany({
      data: scheduleRows(),
    });
    await transaction.platformJob.createMany({
      data: [
        jobRow(
          ids.jobs.campaign,
          "COMMUNICATION_CAMPAIGN_DISCOVERY",
          { batchSize: 10 },
        ),
        jobRow(
          ids.jobs.delivery,
          "COMMUNICATION_DELIVERY_DISCOVERY",
          { batchSize: 10 },
        ),
        jobRow(
          ids.jobs.paymentRetry,
          "PAYMENT_RETRY_DISCOVERY",
          { batchSize: 10 },
        ),
        providerEventJobRow(),
        {
          ...jobRow(
            ids.jobs.reconciliation,
            "PAYMENT_RECONCILIATION",
            { batchSize: 10 },
          ),
          attemptCount: 1,
          completedAt: baseTime,
          fencingToken: BigInt(1),
          resultHash: platformJobHash(completedReconciliation),
          resultMetadata: completedReconciliation,
          status: "SUCCEEDED",
          version: 2,
        },
        jobRow(
          ids.jobs.settlement,
          "SETTLEMENT_STATEMENT_GENERATE",
          { batchSize: 10, periodDays: 1 },
        ),
      ],
    });
    await transaction.platformJobAttempt.create({
      data: {
        attemptNumber: 1,
        createdAt: baseTime,
        fencingToken: BigInt(1),
        finishedAt: baseTime,
        heartbeatAt: baseTime,
        id: ids.reconciliationAttempt,
        jobId: ids.jobs.reconciliation,
        leaseToken: ids.reconciliationLease,
        resultHash: platformJobHash(completedReconciliation),
        resultMetadata: completedReconciliation,
        startedAt: baseTime,
        status: "SUCCEEDED",
        updatedAt: baseTime,
        workerId: "staging:gate6c:fixture-worker",
      },
    });
    await transaction.platformJobMutation.create({
      data: {
        action: "MANUAL_TRIGGER",
        actorAdminUserId: ids.adminUserId,
        actorPersonId: ids.adminPersonId,
        createdAt: baseTime,
        id: ids.reconciliationMutation,
        idempotencyKey: ids.reconciliationMutationKey,
        jobId: ids.jobs.reconciliation,
        requestHash: platformJobHash({
          action: "GATE6C_MANUAL_TRIGGER",
          batchSize: 10,
          jobType: "PAYMENT_RECONCILIATION",
        }),
        result: {
          jobId: ids.jobs.reconciliation,
          jobType: "PAYMENT_RECONCILIATION",
          status: "SUCCEEDED",
          version: 2,
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });

  const settlementEvidence =
    await materializeGate6cSettlementDraftEvidence(prisma);
  return {
    fixture: await communicationsPaymentGate6cFixtureFingerprint(prisma),
    paymentEvidence,
    settlementEvidence,
  };
}

export async function communicationsPaymentGate6cFixtureFingerprint(
  prisma: PrismaClient,
) {
  const ids = communicationsPaymentGate6cFixtureIds;
  const paymentIds = paymentsGate5cFixtureIds;
  const [
    campaigns,
    deliveries,
    paymentAttempts,
    providerEvents,
    refunds,
    journals,
    schedules,
    jobs,
    attempts,
    mutations,
  ] = await Promise.all([
    prisma.communicationCampaign.findMany({
      where: { id: { in: Object.values(ids.campaigns) } },
      orderBy: { id: "asc" },
      select: {
        channels: true,
        id: true,
        status: true,
        version: true,
      },
    }),
    prisma.outboundDelivery.findMany({
      where: { campaignId: { in: Object.values(ids.campaigns) } },
      orderBy: { id: "asc" },
      select: {
        attemptCount: true,
        channel: true,
        id: true,
        status: true,
        version: true,
      },
    }),
    prisma.paymentAttempt.findMany({
      where: { id: paymentIds.attemptIds[12] },
      select: {
        id: true,
        retryCount: true,
        retryable: true,
        status: true,
        version: true,
      },
    }),
    prisma.paymentProviderEvent.findMany({
      where: { id: ids.providerEvent },
      select: {
        id: true,
        normalizedType: true,
        processingVersion: true,
        status: true,
      },
    }),
    prisma.paymentRefund.findMany({
      where: { id: ids.refund },
      select: {
        id: true,
        retryCount: true,
        retryable: true,
        status: true,
        version: true,
      },
    }),
    prisma.financialJournal.findMany({
      where: { id: paymentIds.journalIds[5] },
      select: { id: true, sourceType: true, status: true },
    }),
    prisma.platformJobSchedule.findMany({
      where: { id: { in: Object.values(ids.schedules) } },
      orderBy: { id: "asc" },
      select: {
        enabled: true,
        id: true,
        jobType: true,
        scheduleKey: true,
        version: true,
      },
    }),
    prisma.platformJob.findMany({
      where: { id: { in: Object.values(ids.jobs) } },
      orderBy: { id: "asc" },
      select: {
        attemptCount: true,
        id: true,
        jobType: true,
        source: true,
        status: true,
        version: true,
      },
    }),
    prisma.platformJobAttempt.findMany({
      where: { id: ids.reconciliationAttempt },
      select: { attemptNumber: true, id: true, status: true },
    }),
    prisma.platformJobMutation.findMany({
      where: { id: ids.reconciliationMutation },
      select: { action: true, id: true },
    }),
  ]);
  const rows = jsonSafe({
    attempts,
    campaigns,
    deliveries,
    jobs,
    journals,
    mutations,
    paymentAttempts,
    providerEvents,
    refunds,
    schedules,
  });
  return {
    counts: {
      campaigns: campaigns.length,
      deliveries: deliveries.length,
      jobAttempts: attempts.length,
      jobMutations: mutations.length,
      jobs: jobs.length,
      paymentAttempts: paymentAttempts.length,
      providerEvents: providerEvents.length,
      refunds: refunds.length,
      schedules: schedules.length,
    },
    fingerprint: sha256(JSON.stringify(rows)),
  };
}

export async function communicationsPaymentGate6cForeignSentinels(
  prisma: PrismaClient,
) {
  const [person, organization] = await Promise.all([
    prisma.person.findFirst({
      where: {
        id: {
          notIn: [
            ...stage4cPersonIds,
            ...paymentsGate5cFixtureIds.personIds,
          ],
        },
      },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.organization.findFirst({
      where: {
        id: {
          notIn: [
            communicationsPaymentGate6cFixtureIds.organizationId,
            ...paymentsGate5cFixtureIds.organizationIds,
          ],
        },
      },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
  ]);
  if (process.env.NODE_ENV !== "test" && (!person || !organization)) {
    throw new Error(
      "Gate 6C real staging requires foreign Person and Organization sentinels.",
    );
  }
  return {
    organization: organization ? sentinelHash(organization) : null,
    person: person ? sentinelHash(person) : null,
  };
}

export async function cleanupCommunicationsPaymentGate6cFixture(
  prisma: PrismaClient,
) {
  const ids = communicationsPaymentGate6cFixtureIds;
  const baseSettlementIds = paymentsGate5cFixtureIds.settlementBatchIds;
  const fixtureCampaignIds = Object.values(ids.campaigns);
  const fixtureScheduleIds = Object.values(ids.schedules);

  const providerEventRows = await prisma.paymentProviderEvent.findMany({
    where: {
      providerEventId: { startsWith: COMMUNICATIONS_PAYMENT_GATE6C_MARKER },
    },
    select: { id: true },
  });
  const providerEventIds = providerEventRows.map((event) => event.id);
  const jobRows = await prisma.platformJob.findMany({
    where: {
      jobType: { in: [...gate6cJobTypes] },
      OR: [
        { createdByAdminUserId: ids.adminUserId },
        { providerEventId: { in: providerEventIds } },
      ],
    },
    select: { id: true },
  });
  const jobIds = jobRows.map((job) => job.id);

  const counts = await prisma.$transaction(async (transaction) => {
    const platformMutations = await transaction.platformJobMutation.deleteMany({
      where: {
        OR: [
          { jobId: { in: jobIds } },
          { scheduleId: { in: fixtureScheduleIds } },
          {
            actorAdminUserId: ids.adminUserId,
            action: {
              in: [
                "MANUAL_TRIGGER",
                "SCHEDULE_ENABLE",
                "SCHEDULE_DISABLE",
                "WORKER_BATCH",
                "SCHEDULER_TICK",
              ],
            },
          },
        ],
      },
    });
    const paymentMutations = await transaction.paymentMutation.deleteMany({
      where: { idempotencyKey: { in: jobIds } },
    });
    const adminAudits = await transaction.adminAuditLog.deleteMany({
      where: {
        adminUserId: ids.adminUserId,
        OR: [
          { idempotencyKey: { in: jobIds } },
          { targetId: { in: [ids.refund, ...jobIds] } },
        ],
      },
    });
    const jobAttempts = await transaction.platformJobAttempt.deleteMany({
      where: { jobId: { in: jobIds } },
    });
    const childJobs = await transaction.platformJob.deleteMany({
      where: { id: { in: jobIds }, parentJobId: { not: null } },
    });
    const jobs = await transaction.platformJob.deleteMany({
      where: { id: { in: jobIds } },
    });
    const schedules = await transaction.platformJobSchedule.deleteMany({
      where: { id: { in: fixtureScheduleIds } },
    });

    const settlementBatches = await transaction.settlementBatch.findMany({
      where: {
        id: { notIn: baseSettlementIds },
        organizationId: paymentsGate5cFixtureIds.organizationIds[0],
        periodEnd: closedUtcDay(new Date()),
        periodStart: {
          equals: new Date(closedUtcDay(new Date()).getTime() - 86_400_000),
        },
        status: "DRAFT",
      },
      select: { id: true },
    });
    const settlementIds = settlementBatches.map((batch) => batch.id);
    const settlementLines = await transaction.settlementLine.deleteMany({
      where: { settlementBatchId: { in: settlementIds } },
    });
    const settlements = await transaction.settlementBatch.deleteMany({
      where: { id: { in: settlementIds } },
    });

    const paymentSourceIds = [
      ...providerEventIds,
      ids.refund,
      paymentsGate5cFixtureIds.attemptIds[12]!,
    ];
    const financialJournals = await transaction.financialJournal.findMany({
      where: { sourceId: { in: paymentSourceIds } },
      select: { id: true },
    });
    const financialJournalIds = financialJournals.map((journal) => journal.id);
    const postings = await transaction.financialPosting.deleteMany({
      where: { journalId: { in: financialJournalIds } },
    });
    const journals = await transaction.financialJournal.deleteMany({
      where: { id: { in: financialJournalIds } },
    });
    const notificationStates =
      await transaction.notificationRecipientState.deleteMany({
        where: {
          notification: {
            sourceId: { in: [ids.refund, ...paymentSourceIds] },
          },
        },
      });
    const notifications = await transaction.notification.deleteMany({
      where: { sourceId: { in: [ids.refund, ...paymentSourceIds] } },
    });
    const refunds = await transaction.paymentRefund.deleteMany({
      where: { id: ids.refund },
    });
    const providerEvents = await transaction.paymentProviderEvent.deleteMany({
      where: { id: { in: providerEventIds } },
    });

    const deliveryAttempts =
      await transaction.outboundDeliveryAttempt.deleteMany({
        where: { delivery: { campaignId: { in: fixtureCampaignIds } } },
      });
    const deliveries = await transaction.outboundDelivery.deleteMany({
      where: { campaignId: { in: fixtureCampaignIds } },
    });
    const campaignMutations =
      await transaction.communicationCampaignMutation.deleteMany({
        where: { campaignId: { in: fixtureCampaignIds } },
      });
    const campaigns = await transaction.communicationCampaign.deleteMany({
      where: { id: { in: fixtureCampaignIds } },
    });

    return {
      adminAudits: adminAudits.count,
      campaignMutations: campaignMutations.count,
      campaigns: campaigns.count,
      childJobs: childJobs.count,
      deliveries: deliveries.count,
      deliveryAttempts: deliveryAttempts.count,
      jobAttempts: jobAttempts.count,
      jobs: jobs.count,
      journals: journals.count,
      notificationStates: notificationStates.count,
      notifications: notifications.count,
      paymentMutations: paymentMutations.count,
      platformMutations: platformMutations.count,
      postings: postings.count,
      providerEvents: providerEvents.count,
      refunds: refunds.count,
      schedules: schedules.count,
      settlementLines: settlementLines.count,
      settlements: settlements.count,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });

  return counts;
}

export async function cleanupCommunicationsPaymentGate6cComposedFixture(
  prisma: PrismaClient,
) {
  const gate6c = await cleanupCommunicationsPaymentGate6cFixture(prisma);
  const payments = await cleanupPaymentsGate5cFixture(prisma);
  return { gate6c, payments };
}

function campaignRow(
  campaignId: string,
  status: "CANCELLED" | "DISPATCHING" | "SCHEDULED",
  channels: Array<"EMAIL" | "IN_APP">,
  dates: {
    cancelledAt?: Date;
    cancellationReason?: string;
    dispatchStartedAt?: Date;
    recipientEvaluationAt?: Date;
    scheduledAt?: Date;
  },
): Prisma.CommunicationCampaignCreateManyInput {
  const ids = communicationsPaymentGate6cFixtureIds;
  return {
    audience: "USER",
    cancelledAt: dates.cancelledAt,
    cancellationReason: dates.cancellationReason,
    category: "ADMIN_ANNOUNCEMENT",
    channels,
    createdAt: baseTime,
    createdByAdminUserId: ids.adminUserId,
    destinationKind: "NOTIFICATIONS",
    dispatchStartedAt: dates.dispatchStartedAt,
    id: campaignId,
    localizedContent: {
      AR: {
        email: {
          plainText: "محتوى اصطناعي آمن",
          subject: "اختبار Gate 6C",
        },
        inApp: {
          body: "محتوى اصطناعي آمن",
          title: "اختبار Gate 6C",
        },
      },
      EN: {
        email: {
          plainText: "Safe synthetic content",
          subject: "Gate 6C staging",
        },
        inApp: {
          body: "Safe synthetic content",
          title: "Gate 6C staging",
        },
      },
      CKB: {
        email: {
          plainText: "ناوەڕۆکی دەستکردی پارێزراو",
          subject: "تاقیکردنەوەی Gate 6C",
        },
        inApp: {
          body: "ناوەڕۆکی دەستکردی پارێزراو",
          title: "تاقیکردنەوەی Gate 6C",
        },
      },
    },
    mandatory: false,
    priority: "NORMAL",
    recipientEvaluationAt: dates.recipientEvaluationAt,
    scheduledAt: dates.scheduledAt,
    status,
    targetPersonId: ids.customerPersonId,
    updatedAt: baseTime,
    updatedByAdminUserId: ids.adminUserId,
    version: 1,
  };
}

function scheduleRows(): Prisma.PlatformJobScheduleCreateManyInput[] {
  const ids = communicationsPaymentGate6cFixtureIds;
  const definitions: Array<{
    id: string;
    jobType: PlatformJobType;
    payload: { batchSize: number; periodDays?: 1 };
    scheduleKey: PlatformJobScheduleKey;
  }> = [
    {
      id: ids.schedules.campaign,
      jobType: "COMMUNICATION_CAMPAIGN_DISCOVERY",
      payload: { batchSize: 10 },
      scheduleKey: "COMMUNICATION_CAMPAIGN_DISCOVERY",
    },
    {
      id: ids.schedules.delivery,
      jobType: "COMMUNICATION_DELIVERY_DISCOVERY",
      payload: { batchSize: 10 },
      scheduleKey: "COMMUNICATION_DELIVERY_DISCOVERY",
    },
    {
      id: ids.schedules.paymentRetry,
      jobType: "PAYMENT_RETRY_DISCOVERY",
      payload: { batchSize: 10 },
      scheduleKey: "PAYMENT_RETRY_DISCOVERY",
    },
    {
      id: ids.schedules.reconciliation,
      jobType: "PAYMENT_RECONCILIATION",
      payload: { batchSize: 10 },
      scheduleKey: "PAYMENT_RECONCILIATION",
    },
    {
      id: ids.schedules.settlement,
      jobType: "SETTLEMENT_STATEMENT_GENERATE",
      payload: { batchSize: 10, periodDays: 1 },
      scheduleKey: "SETTLEMENT_STATEMENT_GENERATE",
    },
  ];
  return definitions.map((definition, index) => ({
    cadenceSeconds: definition.scheduleKey.startsWith("COMMUNICATION")
      ? 60
      : 300,
    catchupLimit: 1,
    createdAt: baseTime,
    createdByAdminUserId: ids.adminUserId,
    createdByPersonId: ids.adminPersonId,
    enabled: false,
    id: definition.id,
    jobType: definition.jobType,
    nextRunAt: new Date(baseTime.getTime() + index * 1_000),
    payload: definition.payload,
    payloadHash: platformJobHash(definition.payload),
    payloadVersion: 1,
    scheduleKey: definition.scheduleKey,
    scopeKey: "platform",
    updatedAt: baseTime,
    version: 1,
  }));
}

function jobRow(
  jobId: string,
  jobType: PlatformJobType,
  payload: { batchSize: number; periodDays?: 1 },
): Prisma.PlatformJobCreateManyInput {
  const ids = communicationsPaymentGate6cFixtureIds;
  return {
    availableAt: dueTime,
    createdAt: baseTime,
    createdByAdminUserId: ids.adminUserId,
    createdByPersonId: ids.adminPersonId,
    deduplicationKey: `staging:gate6c:${jobType.toLowerCase()}`,
    id: jobId,
    jobType,
    payload,
    payloadHash: platformJobHash(payload),
    payloadVersion: 1,
    scopeKey: "platform",
    source: "ADMIN_MANUAL",
    status: "AVAILABLE",
    updatedAt: baseTime,
  };
}

function providerEventJobRow(): Prisma.PlatformJobCreateManyInput {
  const ids = communicationsPaymentGate6cFixtureIds;
  const payload = {
    expectedVersion: 1,
    providerEventId: ids.providerEvent,
  };
  return {
    availableAt: dueTime,
    createdAt: baseTime,
    deduplicationKey: `payment-provider-event:${ids.providerEvent}:v1`,
    id: ids.jobs.providerEvent,
    jobType: "PAYMENT_PROVIDER_EVENT_PROCESS",
    payload,
    payloadHash: platformJobHash(payload),
    payloadVersion: 1,
    priority: 7,
    providerEventId: ids.providerEvent,
    scopeKey: "platform",
    source: "PROVIDER_EVENT",
    status: "AVAILABLE",
    updatedAt: baseTime,
  };
}

function previousUtcDayAt1430() {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
    14,
    30,
    0,
    456,
  ));
}

async function materializeGate6cSettlementDraftEvidence(
  prisma: PrismaClient,
) {
  const paymentIds = paymentsGate5cFixtureIds;
  const periodEnd = closedUtcDay(new Date());
  const periodStart = new Date(periodEnd.getTime() - 86_400_000);
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.financialJournal.update({
        where: { id: paymentIds.journalIds[5] },
        data: { postedAt: previousUtcDayAt1430(), status: "POSTED" },
      });
      await transaction.$executeRaw(
        Prisma.sql`SET CONSTRAINTS "FinancialJournal_balance_trigger" IMMEDIATE`,
      );
      const batch = await transaction.settlementBatch.create({
        data: {
          captureGross: "18000.000",
          currency: "IQD",
          id: id(801),
          idempotencyKey: id(803),
          merchantNet: "18000.000",
          organizationId: paymentIds.organizationIds[0]!,
          periodEnd,
          periodStart,
          requestHash: sha256(
            `${COMMUNICATIONS_PAYMENT_GATE6C_MARKER}:settlement-draft`,
          ),
          status: "DRAFT",
        },
      });
      await transaction.settlementLine.create({
        data: {
          captureGross: "18000.000",
          currency: "IQD",
          id: id(802),
          journalId: paymentIds.journalIds[5]!,
          merchantNet: "18000.000",
          organizationId: paymentIds.organizationIds[0]!,
          settlementBatchId: batch.id,
        },
      });
      throw new Gate6CSettlementEvidence({
        draftCreated: true,
        finalizationAutomatic: false,
        lineCount: 1,
        meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT",
        payoutConnected: false,
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30_000,
    });
  } catch (error) {
    if (error instanceof Gate6CSettlementEvidence) return error.evidence;
    throw error;
  }
  throw new Error(
    "Gate 6C rollback-only settlement evidence unexpectedly committed.",
  );
}

class Gate6CSettlementEvidence extends Error {
  constructor(readonly evidence: {
    draftCreated: true;
    finalizationAutomatic: false;
    lineCount: 1;
    meaning: "LEDGER_STATEMENT_NOT_BANK_PAYOUT";
    payoutConnected: false;
  }) {
    super("Gate 6C settlement evidence rollback");
  }
}

function closedUtcDay(now: Date) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested),
  ) as T;
}

function sentinelHash(value: {
  id: string;
  status: string;
  updatedAt: Date;
}) {
  return sha256(JSON.stringify({
    id: value.id,
    status: value.status,
    updatedAt: value.updatedAt.toISOString(),
  }));
}
