import "server-only";

import { type PlatformJobType, Prisma } from "@prisma/client";

import { deterministicSinkEnabled } from "@/features/communications/providers/provider";
import { paymentProvider } from "@/features/payments/providers/registry";
import { requiredPlatformJobPermissions } from "@/features/platform-jobs/domain/authority";
import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { STAGE_6_ARCHITECTURE } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  assertPlatformJobAdminCurrent,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import { enqueuePlatformJob } from "@/features/platform-jobs/services/jobs";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";

const GATE6C_TRIGGER_TYPES = [
  "COMMUNICATION_CAMPAIGN_DISCOVERY",
  "COMMUNICATION_DELIVERY_DISCOVERY",
  "PAYMENT_RETRY_DISCOVERY",
  "PAYMENT_RECONCILIATION",
  "SETTLEMENT_STATEMENT_GENERATE",
] as const satisfies readonly PlatformJobType[];

export async function communicationsPaymentAutomationStatus(
  context: PlatformJobAdminContext,
) {
  return runPlatformJobSerializable(async (transaction) => {
    await assertPlatformJobAdminCurrent(transaction, context, [
      "PLATFORM_JOBS_MANAGE",
      "COMMUNICATIONS_DISPATCH",
      "PAYMENTS_RECONCILE",
      "PAYMENTS_REFUND",
      "SETTLEMENTS_MANAGE",
    ]);
    return {
      communicationProviders: {
        EMAIL: deterministicSinkEnabled(process.env) ? "DETERMINISTIC_STAGING_SINK" : "NOT_CONFIGURED",
        PUSH: deterministicSinkEnabled(process.env) ? "DETERMINISTIC_STAGING_SINK" : "NOT_CONFIGURED",
        SMS: deterministicSinkEnabled(process.env) ? "DETERMINISTIC_STAGING_SINK" : "NOT_CONFIGURED",
      },
      gate: "6C",
      humanDeliveryClaim: false,
      jobTypes: [
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
      paymentProvider: paymentProvider().kind,
      payoutConnected: false,
      runtime: STAGE_6_ARCHITECTURE.runtime,
      scheduleKeys: [...GATE6C_TRIGGER_TYPES],
      state: "ACTIVE",
      type: "COMMUNICATIONS_PAYMENT_AUTOMATION_STATUS",
    } as const;
  });
}

export async function triggerGate6CAutomation(
  context: PlatformJobAdminContext,
  input: {
    batchSize: number;
    idempotencyKey: string;
    jobType: (typeof GATE6C_TRIGGER_TYPES)[number];
  },
) {
  if (!GATE6C_TRIGGER_TYPES.includes(input.jobType)) {
    platformJobError("VALIDATION_ERROR", "The Gate 6C automation type is not allow-listed.");
  }
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      requiredPlatformJobPermissions(input.jobType),
    );
    const requestHash = platformJobHash({
      action: "GATE6C_MANUAL_TRIGGER",
      batchSize: input.batchSize,
      jobType: input.jobType,
    });
    const existing = await transaction.platformJobMutation.findUnique({
      where: {
        actorAdminUserId_idempotencyKey: {
          actorAdminUserId: current.userId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (
        existing.action !== "MANUAL_TRIGGER"
        || existing.requestHash !== requestHash
        || !existing.result
        || typeof existing.result !== "object"
        || Array.isArray(existing.result)
      ) {
        platformJobError("IDEMPOTENCY_CONFLICT", "The Gate 6C trigger key was reused with changed input.");
      }
      return {
        ...(existing.result as Record<string, string | number | boolean | null>),
        replay: true as const,
      };
    }
    const now = await databaseNow(transaction);
    const created = await enqueuePlatformJob(transaction, {
      availableAt: now,
      createdByAdminUserId: current.userId,
      createdByPersonId: current.personId,
      deduplicationKey: `gate6c:manual:${input.jobType}:${input.idempotencyKey}`,
      jobType: input.jobType,
      maxAttempts: 5,
      payload: input.jobType === "SETTLEMENT_STATEMENT_GENERATE"
        ? { batchSize: input.batchSize, periodDays: 1 }
        : { batchSize: input.batchSize },
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    });
    const result = {
      jobId: created.job.id,
      jobType: created.job.jobType,
      status: created.job.status,
      version: created.job.version,
    };
    await transaction.platformJobMutation.create({
      data: {
        action: "MANUAL_TRIGGER",
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        jobId: created.job.id,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function databaseNow(transaction: Prisma.TransactionClient) {
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
  return clock.now;
}
