import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type PlatformJobType } from "@prisma/client";

import type { CommerceAdminContext } from "@/features/commerce/services/authorization";
import { CommunicationDomainError } from "@/features/communications/domain/errors";
import {
  claimExactDeliveryForAutomation,
  processClaimedDeliveries,
  releaseExpiredClaims,
  sendCampaignNow,
  type CommunicationExecutionGuard,
} from "@/features/communications/services/dispatcher";
import { PaymentDomainError } from "@/features/payments/domain/errors";
import { retryPaymentAttemptFromAutomation } from "@/features/payments/services/payment-intents";
import {
  processVerifiedPaymentProviderEvent,
  type PaymentExecutionGuard,
} from "@/features/payments/services/provider-events";
import { runPaymentReconciliation } from "@/features/payments/services/reconciliation";
import { retryAdminRefund } from "@/features/payments/services/refunds";
import { previewSettlement } from "@/features/payments/services/settlements";
import { requiredPlatformJobPermissions } from "@/features/platform-jobs/domain/authority";
import { PlatformJobDomainError, platformJobError } from "@/features/platform-jobs/domain/errors";
import type {
  PlatformJobHandlerContext,
  PlatformJobHandlerResult,
} from "@/features/platform-jobs/services/handlers";
import { enqueueDomainDiscoveryPlatformJob } from "@/features/platform-jobs/services/jobs";
import { assertPlatformJobOperationAuthorized } from "@/features/platform-jobs/services/operation-lease";
import { prisma } from "@/lib/db/prisma";

type JobContext = PlatformJobHandlerContext;
type DiscoveryPayload = { batchSize: number };
type CampaignPayload = { campaignId: string; expectedVersion: number };
type DeliveryPayload = { deliveryId: string; expectedVersion: number };
type ProviderEventPayload = { expectedVersion: number; providerEventId: string };
type AttemptPayload = { attemptId: string; expectedVersion: number };
type RefundPayload = { expectedVersion: number; refundId: string };
type SettlementPayload = { batchSize: number; periodDays: 1 };

type Gate6CJobType =
  | "COMMUNICATION_CAMPAIGN_DISCOVERY"
  | "COMMUNICATION_DELIVERY_DISCOVERY"
  | "COMMUNICATION_CAMPAIGN_DISPATCH"
  | "COMMUNICATION_DELIVERY_DISPATCH"
  | "PAYMENT_PROVIDER_EVENT_PROCESS"
  | "PAYMENT_RETRY_DISCOVERY"
  | "PAYMENT_ATTEMPT_RETRY"
  | "PAYMENT_REFUND_RETRY"
  | "PAYMENT_RECONCILIATION"
  | "SETTLEMENT_STATEMENT_GENERATE";

export async function runCommunicationsPaymentAutomationHandler(
  jobType: Gate6CJobType,
  payload: unknown,
  context: JobContext,
): Promise<PlatformJobHandlerResult> {
  try {
    switch (jobType) {
      case "COMMUNICATION_CAMPAIGN_DISCOVERY":
        return success(await discoverCampaigns(payload as DiscoveryPayload, context));
      case "COMMUNICATION_DELIVERY_DISCOVERY":
        return success(await discoverDeliveries(payload as DiscoveryPayload, context));
      case "COMMUNICATION_CAMPAIGN_DISPATCH":
        return success(await dispatchCampaign(payload as CampaignPayload, context));
      case "COMMUNICATION_DELIVERY_DISPATCH":
        return success(await dispatchDelivery(payload as DeliveryPayload, context));
      case "PAYMENT_PROVIDER_EVENT_PROCESS":
        return success(await processProviderEvent(payload as ProviderEventPayload, context));
      case "PAYMENT_RETRY_DISCOVERY":
        return success(await discoverPaymentRetries(payload as DiscoveryPayload, context));
      case "PAYMENT_ATTEMPT_RETRY":
        return success(await retryPaymentAttempt(payload as AttemptPayload, context));
      case "PAYMENT_REFUND_RETRY":
        return success(await retryPaymentRefund(payload as RefundPayload, context));
      case "PAYMENT_RECONCILIATION":
        return success(await reconcilePayments(payload as DiscoveryPayload, context));
      case "SETTLEMENT_STATEMENT_GENERATE":
        return success(await generateSettlementDrafts(payload as SettlementPayload, context));
    }
  } catch (error) {
    if (error instanceof AutomationFailure) {
      return {
        errorCode: error.errorCode,
        outcome: "FAILED",
        retryable: error.retryable,
      };
    }
    if (
      error instanceof PlatformJobDomainError
      || error instanceof CommunicationDomainError
      || error instanceof PaymentDomainError
    ) {
      return { errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false };
    }
    return { errorCode: "HANDLER_EXCEPTION", outcome: "FAILED", retryable: true };
  }
}

async function discoverCampaigns(payload: DiscoveryPayload, context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const candidates = await transaction.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
      SELECT campaign."id", campaign."version"
      FROM "CommunicationCampaign" AS campaign
      WHERE campaign."status" = 'SCHEDULED'
        AND campaign."scheduledAt" <= ${now}
      ORDER BY campaign."scheduledAt", campaign."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    let enqueued = 0;
    for (const candidate of candidates) {
      enqueued += Number(await enqueueChild(transaction, job, context.jobId, {
        availableAt: now,
        deduplicationKey: `communication-campaign:${candidate.id}:v${candidate.version}`,
        jobType: "COMMUNICATION_CAMPAIGN_DISPATCH",
        payload: { campaignId: candidate.id, expectedVersion: candidate.version },
      }));
    }
    return {
      enqueued,
      kind: "COMMUNICATION_CAMPAIGNS_DISCOVERED" as const,
      scanned: candidates.length,
      skipped: candidates.length - enqueued,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function discoverDeliveries(payload: DiscoveryPayload, context: JobContext) {
  const guard = executionGuard(context);
  const now = new Date();
  await releaseExpiredClaims(now, guard);
  return prisma.$transaction(async (transaction) => {
    const { job, now: databaseNow } = await assertJobLease(transaction, context);
    const candidates = await transaction.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
      SELECT delivery."id", delivery."version"
      FROM "OutboundDelivery" AS delivery
      JOIN "CommunicationCampaign" AS campaign ON campaign."id" = delivery."campaignId"
      WHERE delivery."status" IN ('PENDING', 'RETRY_SCHEDULED')
        AND (delivery."nextAttemptAt" IS NULL OR delivery."nextAttemptAt" <= ${databaseNow})
        AND campaign."status" = 'DISPATCHING'
      ORDER BY delivery."nextAttemptAt" NULLS FIRST, delivery."id"
      FOR UPDATE OF delivery SKIP LOCKED
      LIMIT ${payload.batchSize}
    `);
    let enqueued = 0;
    for (const candidate of candidates) {
      enqueued += Number(await enqueueChild(transaction, job, context.jobId, {
        availableAt: databaseNow,
        deduplicationKey: `communication-delivery:${candidate.id}:v${candidate.version}`,
        jobType: "COMMUNICATION_DELIVERY_DISPATCH",
        payload: { deliveryId: candidate.id, expectedVersion: candidate.version },
      }));
    }
    return {
      enqueued,
      kind: "COMMUNICATION_DELIVERIES_DISCOVERED" as const,
      scanned: candidates.length,
      skipped: candidates.length - enqueued,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function dispatchCampaign(payload: CampaignPayload, context: JobContext) {
  const guard = executionGuard(context);
  const prepared = await prisma.$transaction(async (transaction) => {
    const { actor } = await assertJobLease(transaction, context);
    const campaign = await transaction.communicationCampaign.findUnique({
      where: { id: payload.campaignId },
      select: { status: true, version: true },
    });
    return { actor, campaign };
  });
  if (!prepared.campaign) return exact("COMMUNICATION_CAMPAIGN_DISPATCHED", "ABSENT", "ABSENT");
  if (prepared.campaign.version !== payload.expectedVersion) {
    return exact("COMMUNICATION_CAMPAIGN_DISPATCHED", "STALE", prepared.campaign.status);
  }
  if (!["DRAFT", "SCHEDULED"].includes(prepared.campaign.status)) {
    return exact("COMMUNICATION_CAMPAIGN_DISPATCHED", "SUPERSEDED", prepared.campaign.status);
  }
  const summary = await sendCampaignNow(prepared.actor, {
    campaignId: payload.campaignId,
    expectedVersion: payload.expectedVersion,
    idempotencyKey: context.jobId,
  }, new Date(), guard);
  return exact("COMMUNICATION_CAMPAIGN_DISPATCHED", "COMPLETED", summary.status);
}

async function dispatchDelivery(payload: DeliveryPayload, context: JobContext) {
  const guard = executionGuard(context);
  const claimOwner = "platform-job:" + context.jobId;
  const claimed = await claimExactDeliveryForAutomation({
    claimOwner,
    deliveryId: payload.deliveryId,
    executionGuard: guard,
    expectedVersion: payload.expectedVersion,
  });
  if (!claimed) {
    const current = await guardedDeliveryState(payload.deliveryId, guard);
    if (!current) return exact("COMMUNICATION_DELIVERY_DISPATCHED", "ABSENT", "ABSENT");
    const outcome = current.version !== payload.expectedVersion
      ? "STALE"
      : ["ACCEPTED", "PERMANENT_FAILURE", "SUPPRESSED", "CANCELLED"].includes(current.status)
        ? "SUPERSEDED"
        : "INELIGIBLE";
    return exact("COMMUNICATION_DELIVERY_DISPATCHED", outcome, current.status);
  }
  await processClaimedDeliveries(claimOwner, [payload.deliveryId], new Date(), guard);
  const current = await guardedDeliveryState(payload.deliveryId, guard);
  return exact(
    "COMMUNICATION_DELIVERY_DISPATCHED",
    "COMPLETED",
    current?.status ?? "ABSENT",
  );
}

async function processProviderEvent(payload: ProviderEventPayload, context: JobContext) {
  const guard = executionGuard(context);
  const linked = await prisma.$transaction(async (transaction) => {
    const { job } = await assertJobLease(transaction, context);
    const directProviderEvent = job.source === "PROVIDER_EVENT"
      && job.providerEventId === payload.providerEventId;
    const authorizedRequeue = job.source === "ADMIN_MANUAL"
      && job.requeueRoot?.source === "PROVIDER_EVENT"
      && job.requeueRoot.providerEventId === payload.providerEventId;
    return directProviderEvent || authorizedRequeue;
  });
  if (!linked) automationFailure("PERMANENT_FAILURE", false);
  const result = await processVerifiedPaymentProviderEvent({
    eventId: payload.providerEventId,
    executionGuard: guard,
    expectedVersion: payload.expectedVersion,
  });
  return exact("PAYMENT_PROVIDER_EVENT_PROCESSED", result.outcome, result.state);
}

async function discoverPaymentRetries(payload: DiscoveryPayload, context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { job, now } = await assertJobLease(transaction, context);
    const candidates = await transaction.$queryRaw<Array<{
      id: string;
      kind: "ATTEMPT" | "REFUND";
      nextRetryAt: Date;
      version: number;
    }>>(Prisma.sql`
      SELECT candidate."id", candidate."kind", candidate."nextRetryAt", candidate."version"
      FROM (
        (
          SELECT attempt."id", 'ATTEMPT'::text AS "kind",
                 attempt."nextRetryAt", attempt."version"
          FROM "PaymentAttempt" AS attempt
          WHERE attempt."status" = 'FAILED'
            AND attempt."retryable" IS TRUE
            AND attempt."nextRetryAt" <= ${now}
            AND attempt."retryCount" < 5
          ORDER BY attempt."nextRetryAt", attempt."id"
          LIMIT ${payload.batchSize}
        )
        UNION ALL
        (
          SELECT refund."id", 'REFUND'::text AS "kind",
                 refund."nextRetryAt", refund."version"
          FROM "PaymentRefund" AS refund
          WHERE refund."status" = 'FAILED'
            AND refund."retryable" IS TRUE
            AND refund."nextRetryAt" <= ${now}
            AND refund."retryCount" < 5
          ORDER BY refund."nextRetryAt", refund."id"
          LIMIT ${payload.batchSize}
        )
      ) AS candidate
      ORDER BY candidate."nextRetryAt", candidate."id"
      LIMIT ${payload.batchSize}
    `);
    let enqueued = 0;
    for (const candidate of candidates) {
      const attempt = candidate.kind === "ATTEMPT";
      enqueued += Number(await enqueueChild(transaction, job, context.jobId, {
        availableAt: now,
        deduplicationKey: `${attempt ? "payment-attempt" : "payment-refund"}:${candidate.id}:v${candidate.version}`,
        jobType: attempt ? "PAYMENT_ATTEMPT_RETRY" : "PAYMENT_REFUND_RETRY",
        payload: attempt
          ? { attemptId: candidate.id, expectedVersion: candidate.version }
          : { expectedVersion: candidate.version, refundId: candidate.id },
      }));
    }
    return {
      enqueued,
      kind: "PAYMENT_RETRIES_DISCOVERED" as const,
      scanned: candidates.length,
      skipped: candidates.length - enqueued,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function retryPaymentAttempt(payload: AttemptPayload, context: JobContext) {
  const prepared = await currentActor(context);
  const result = await retryPaymentAttemptFromAutomation(commerceActor(prepared), {
    attemptId: payload.attemptId,
    executionGuard: executionGuard(context),
    expectedVersion: payload.expectedVersion,
    jobId: context.jobId,
  });
  return exact("PAYMENT_ATTEMPT_RETRIED", result.outcome, result.state);
}

async function retryPaymentRefund(payload: RefundPayload, context: JobContext) {
  const actor = commerceActor(await currentActor(context));
  const guard = executionGuard(context);
  const existing = await prisma.$transaction(async (transaction) => {
    await guard(transaction);
    return transaction.paymentRefund.findUnique({
      where: { id: payload.refundId },
      select: { status: true, version: true },
    });
  });
  if (!existing) return exact("PAYMENT_REFUND_RETRIED", "ABSENT", "ABSENT");
  if (existing.version !== payload.expectedVersion) {
    return exact("PAYMENT_REFUND_RETRIED", "STALE", existing.status);
  }
  if (existing.status !== "FAILED") {
    return exact("PAYMENT_REFUND_RETRIED", "INELIGIBLE", existing.status);
  }
  await retryAdminRefund(actor, payload.refundId, {
    expectedVersion: payload.expectedVersion,
    idempotencyKey: context.jobId,
  }, guard, true);
  const current = await prisma.paymentRefund.findUniqueOrThrow({
    where: { id: payload.refundId },
    select: { status: true },
  });
  return exact("PAYMENT_REFUND_RETRIED", "COMPLETED", current.status);
}

async function reconcilePayments(payload: DiscoveryPayload, context: JobContext) {
  const result = await runPaymentReconciliation(
    commerceActor(await currentActor(context)),
    { idempotencyKey: context.jobId, limit: payload.batchSize },
    executionGuard(context),
  );
  return {
    counts: result.summary,
    kind: "PAYMENT_RECONCILED" as const,
    scanned: result.checked,
  };
}

async function generateSettlementDrafts(payload: SettlementPayload, context: JobContext) {
  const guard = executionGuard(context);
  const actor = commerceActor(await currentActor(context));
  const periodEnd = closedUtcDay(new Date());
  const periodStart = new Date(periodEnd.getTime() - payload.periodDays * 24 * 60 * 60_000);
  const organizations = await prisma.$transaction(async (transaction) => {
    await guard(transaction);
    return transaction.$queryRaw<Array<{ organizationId: string }>>(Prisma.sql`
      SELECT DISTINCT intent."organizationId"
      FROM "FinancialJournal" AS journal
      JOIN "PaymentIntent" AS intent ON intent."id" = journal."paymentIntentId"
      WHERE journal."status" = 'POSTED'
        AND journal."sourceType" IN ('CAPTURE', 'REFUND')
        AND journal."currency" = 'IQD'
        AND journal."postedAt" >= ${periodStart}
        AND journal."postedAt" < ${periodEnd}
      ORDER BY intent."organizationId"
      LIMIT ${payload.batchSize}
    `);
  });
  let created = 0;
  let skipped = 0;
  for (const organization of organizations) {
    const existing = await prisma.$transaction(async (transaction) => {
      await guard(transaction);
      return transaction.settlementBatch.findFirst({
        where: {
          currency: "IQD",
          organizationId: organization.organizationId,
          periodEnd,
          periodStart,
          status: "DRAFT",
        },
        select: { id: true },
      });
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const idempotencyKey = deterministicUuid(
      `settlement:${context.jobId}:${organization.organizationId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`,
    );
    try {
      await previewSettlement(actor, {
        currency: "IQD",
        idempotencyKey,
        organizationId: organization.organizationId,
        periodEnd,
        periodStart,
      }, guard);
      created += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const raced = await prisma.$transaction(async (transaction) => {
        await guard(transaction);
        return transaction.settlementBatch.findFirst({
          where: {
            currency: "IQD",
            organizationId: organization.organizationId,
            periodEnd,
            periodStart,
            status: "DRAFT",
          },
          select: { id: true },
        });
      });
      if (!raced) throw error;
      skipped += 1;
    }
  }
  return {
    created,
    kind: "SETTLEMENT_DRAFTS_GENERATED" as const,
    scanned: organizations.length,
    skipped,
  };
}

function executionGuard(context: JobContext): CommunicationExecutionGuard & PaymentExecutionGuard {
  return async (transaction) => {
    await assertJobLease(transaction, context);
  };
}

async function currentActor(context: JobContext) {
  return prisma.$transaction(async (transaction) => {
    const { actor } = await assertJobLease(transaction, context);
    return actor;
  });
}

async function guardedDeliveryState(
  deliveryId: string,
  guard: CommunicationExecutionGuard,
) {
  return prisma.$transaction(async (transaction) => {
    await guard(transaction);
    return transaction.outboundDelivery.findUnique({
      where: { id: deliveryId },
      select: { status: true, version: true },
    });
  });
}

async function assertJobLease(transaction: Prisma.TransactionClient, context: JobContext) {
  if (context.signal.aborted) automationFailure("HANDLER_ABORTED", false);
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) automationFailure("PERMANENT_FAILURE", false);
  if (!context.operation) {
    platformJobError("FORBIDDEN", "Gate 6C handler execution requires worker-operation authority.");
  }
  const actor = await assertPlatformJobOperationAuthorized(
    transaction,
    context.operation,
    clock.now,
    requiredPlatformJobPermissions(context.jobType),
  );
  const job = await transaction.platformJob.findFirst({
    where: {
      fencingToken: context.fencingToken,
      id: context.jobId,
      jobType: context.jobType,
      leaseExpiresAt: { gt: clock.now },
      leaseToken: context.leaseToken,
      status: "RUNNING",
    },
    select: {
      createdByAdminUserId: true,
      createdByPersonId: true,
      providerEventId: true,
      requeueRoot: {
        select: {
          providerEventId: true,
          source: true,
        },
      },
      source: true,
    },
  });
  if (!job) automationFailure("PERMANENT_FAILURE", false);
  return { actor, job, now: clock.now };
}

async function enqueueChild(
  transaction: Prisma.TransactionClient,
  parent: { createdByAdminUserId: string | null; createdByPersonId: string | null },
  parentJobId: string,
  input: {
    availableAt: Date;
    deduplicationKey: string;
    jobType: Exclude<PlatformJobType, "PLATFORM_HEALTH_PROBE">;
    payload: unknown;
  },
) {
  if (!parent.createdByAdminUserId || !parent.createdByPersonId) {
    automationFailure("PERMANENT_FAILURE", false);
  }
  const created = await enqueueDomainDiscoveryPlatformJob(transaction, {
    availableAt: input.availableAt,
    createdByAdminUserId: parent.createdByAdminUserId,
    createdByPersonId: parent.createdByPersonId,
    deduplicationKey: input.deduplicationKey,
    jobType: input.jobType,
    maxAttempts: 5,
    parentJobId,
    payload: input.payload,
    payloadVersion: 1,
  });
  return !created.replay;
}

function commerceActor(
  actor: {
    adminAccessId: string | null;
    permissions: readonly import("@/features/admin/config/permissions").AdminPermission[];
    personId: string;
    source: "database" | "env";
    userId: string;
  },
): CommerceAdminContext {
  return {
    ...actor,
    isSuperAdmin: actor.source === "env",
  };
}

function exact<const K extends string>(
  kind: K,
  outcome: "COMPLETED" | "ABSENT" | "STALE" | "SUPERSEDED" | "INELIGIBLE",
  state: string,
) {
  return { kind, outcome, state };
}

function success(metadata: unknown): PlatformJobHandlerResult {
  return { metadata, outcome: "SUCCEEDED" };
}

function closedUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function deterministicUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class AutomationFailure extends Error {
  constructor(
    readonly errorCode: "HANDLER_ABORTED" | "PERMANENT_FAILURE" | "TRANSIENT_FAILURE",
    readonly retryable: boolean,
  ) {
    super(errorCode);
  }
}

function automationFailure(
  errorCode: "HANDLER_ABORTED" | "PERMANENT_FAILURE" | "TRANSIENT_FAILURE",
  retryable: boolean,
): never {
  throw new AutomationFailure(errorCode, retryable);
}
