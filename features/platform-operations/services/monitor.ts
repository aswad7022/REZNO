import "server-only";

import {
  PlatformAlertRule,
  PlatformOperationDomain,
  PlatformSeverity,
  Prisma,
} from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import type { PlatformRuntimeAuthority } from "@/features/platform-operations/services/runtime-authority";

const METRIC_CAP = 100;

interface MonitorActor {
  personId: string;
  permissions: readonly AdminPermission[];
  runtimeAuthority?: PlatformRuntimeAuthority;
  source: "database" | "env" | "runtime";
  userId: string;
}

interface MetricRow {
  communicationBacklog: number;
  deadLetteredJobs: number;
  delayedSchedules: number;
  expiredLeases: number;
  overdueJobs: number;
  paymentBacklog: number;
  runtimeStale: boolean;
  settlementGenerationStale: boolean;
  storageBacklog: number;
}

interface Observation {
  active: boolean;
  domain: PlatformOperationDomain;
  observation: { count: number; saturated: boolean };
  rule: PlatformAlertRule;
  severity: PlatformSeverity;
  summaryCode: string;
}

export async function reconcilePlatformOperationAlerts(
  transaction: Prisma.TransactionClient,
  actor: MonitorActor,
  now: Date,
) {
  const metrics = await collectMetrics(transaction);
  const observations = monitorObservations(metrics);
  const result = {
    acknowledged: 0,
    observed: 0,
    opened: 0,
    reopened: 0,
    resolved: 0,
  };
  for (const observation of observations) {
    const outcome = await reconcileObservation(
      transaction,
      actor,
      now,
      observation,
    );
    result[outcome] += 1;
  }
  return result;
}

async function collectMetrics(
  transaction: Prisma.TransactionClient,
): Promise<MetricRow> {
  const rows = await transaction.$queryRaw<MetricRow[]>(Prisma.sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM "PlatformRuntimeControl" AS control
        WHERE control."state" = 'ENABLED'
          AND NOT EXISTS (
            SELECT 1
            FROM "PlatformRuntimeInvocation" AS invocation
            WHERE invocation."controlId" = control."id"
              AND invocation."state" = 'RUNNING'
              AND invocation."leaseExpiresAt" > clock_timestamp()
            LIMIT 1
          )
          AND (
            control."lastSucceededAt" IS NULL
            OR control."lastSucceededAt"
              < clock_timestamp()
                - (control."expectedIntervalSeconds" * 3 * INTERVAL '1 second')
          )
        LIMIT 1
      ) AS "runtimeStale",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "PlatformJob"
          WHERE "status" IN ('SCHEDULED', 'AVAILABLE', 'RETRY_WAIT')
            AND "availableAt" <= clock_timestamp() - INTERVAL '5 minutes'
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "overdueJobs",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "PlatformJob"
          WHERE "status" IN ('CLAIMED', 'RUNNING')
            AND "leaseExpiresAt" <= clock_timestamp()
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "expiredLeases",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "PlatformJob"
          WHERE "status" = 'DEAD_LETTERED'
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "deadLetteredJobs",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "PlatformJobSchedule"
          WHERE "enabled" IS TRUE
            AND "nextRunAt"
              < clock_timestamp() - ("cadenceSeconds" * INTERVAL '1 second')
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "delayedSchedules",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "UploadSession"
          WHERE "state" IN ('CREATED', 'TARGET_ISSUED', 'UPLOADED', 'FAILED')
            AND "expiresAt" <= clock_timestamp()
          UNION ALL
          SELECT 1
          FROM "StoredAsset"
          WHERE "state" IN ('DELETE_PENDING', 'PENDING_INSPECTION')
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "storageBacklog",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "CommunicationCampaign"
          WHERE "status" = 'SCHEDULED'
            AND "scheduledAt" <= clock_timestamp()
          UNION ALL
          SELECT 1
          FROM "OutboundDelivery"
          WHERE "status" IN ('PENDING', 'RETRY_SCHEDULED')
            AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= clock_timestamp())
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "communicationBacklog",
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM "PaymentAttempt"
          WHERE "status" = 'FAILED'
            AND "retryable" IS TRUE
            AND "nextRetryAt" <= clock_timestamp()
          UNION ALL
          SELECT 1
          FROM "PaymentRefund"
          WHERE "status" = 'FAILED'
            AND "retryable" IS TRUE
            AND "nextRetryAt" <= clock_timestamp()
          UNION ALL
          SELECT 1
          FROM "PaymentProviderEvent"
          WHERE "status" = 'VERIFIED'
          LIMIT ${METRIC_CAP + 1}
        ) AS bounded
      ) AS "paymentBacklog",
      EXISTS (
        SELECT 1
        FROM "PlatformJobSchedule"
        WHERE "scheduleKey" = 'SETTLEMENT_STATEMENT_GENERATE'
          AND "enabled" IS TRUE
          AND "nextRunAt"
            < clock_timestamp() - ("cadenceSeconds" * INTERVAL '1 second')
        LIMIT 1
      ) AS "settlementGenerationStale"
  `);
  const row = rows[0];
  if (!row) throw new Error("PLATFORM_MONITOR_METRICS_UNAVAILABLE");
  return row;
}

function monitorObservations(metrics: MetricRow): Observation[] {
  return [
    booleanObservation(
      "RUNTIME_STALE",
      "PLATFORM",
      "CRITICAL",
      "platform_runtime_stale",
      metrics.runtimeStale,
    ),
    countObservation(
      "OVERDUE_JOBS",
      "PLATFORM",
      "WARNING",
      "platform_jobs_overdue",
      metrics.overdueJobs,
    ),
    countObservation(
      "EXPIRED_LEASES",
      "PLATFORM",
      "CRITICAL",
      "platform_job_leases_expired",
      metrics.expiredLeases,
    ),
    countObservation(
      "DEAD_LETTERED_JOBS",
      "PLATFORM",
      "WARNING",
      "platform_jobs_dead_lettered",
      metrics.deadLetteredJobs,
    ),
    countObservation(
      "DELAYED_SCHEDULES",
      "PLATFORM",
      "WARNING",
      "platform_schedules_delayed",
      metrics.delayedSchedules,
    ),
    countObservation(
      "STORAGE_BACKLOG",
      "STORAGE",
      "WARNING",
      "storage_automation_backlog",
      metrics.storageBacklog,
    ),
    countObservation(
      "COMMUNICATION_BACKLOG",
      "COMMUNICATIONS",
      "WARNING",
      "communication_automation_backlog",
      metrics.communicationBacklog,
    ),
    countObservation(
      "PAYMENT_BACKLOG",
      "PAYMENTS",
      "CRITICAL",
      "payment_automation_backlog",
      metrics.paymentBacklog,
    ),
    booleanObservation(
      "SETTLEMENT_GENERATION_STALE",
      "SETTLEMENTS",
      "WARNING",
      "settlement_generation_stale",
      metrics.settlementGenerationStale,
    ),
    booleanObservation(
      "RATE_LIMIT_STORE_UNAVAILABLE",
      "PLATFORM",
      "CRITICAL",
      "distributed_rate_limit_store_unavailable",
      false,
    ),
  ];
}

function countObservation(
  rule: PlatformAlertRule,
  domain: PlatformOperationDomain,
  severity: PlatformSeverity,
  summaryCode: string,
  count: number,
): Observation {
  return {
    active: count > 0,
    domain,
    observation: {
      count: Math.min(count, METRIC_CAP),
      saturated: count > METRIC_CAP,
    },
    rule,
    severity,
    summaryCode,
  };
}

function booleanObservation(
  rule: PlatformAlertRule,
  domain: PlatformOperationDomain,
  severity: PlatformSeverity,
  summaryCode: string,
  active: boolean,
): Observation {
  return {
    active,
    domain,
    observation: { count: active ? 1 : 0, saturated: false },
    rule,
    severity,
    summaryCode,
  };
}

async function reconcileObservation(
  transaction: Prisma.TransactionClient,
  actor: MonitorActor,
  now: Date,
  observation: Observation,
) {
  const deduplicationKey = `platform:${observation.rule.toLowerCase()}`;
  await transaction.$queryRaw(Prisma.sql`
    SELECT CAST(
      pg_advisory_xact_lock(hashtextextended(${deduplicationKey}, 0))
      AS text
    ) AS locked
  `);
  const existing = await transaction.platformAlert.findUnique({
    where: { deduplicationKey },
  });
  if (observation.active && !existing) {
    const alert = await transaction.platformAlert.create({
      data: {
        deduplicationKey,
        domain: observation.domain,
        firstObservedAt: now,
        lastObservedAt: now,
        observation: observation.observation,
        rule: observation.rule,
        severity: observation.severity,
        summaryCode: observation.summaryCode,
      },
    });
    await createHistory(transaction, actor, alert.id, "OPENED", null, "OPEN", {
      rule: observation.rule,
      ...observation.observation,
    });
    return "opened" as const;
  }
  if (observation.active && existing) {
    const reopened = existing.state === "RESOLVED";
    const state = reopened ? "OPEN" as const : existing.state;
    await transaction.platformAlert.update({
      where: { id: existing.id },
      data: {
        ...(reopened
          ? {
              acknowledgedAt: null,
              acknowledgedByAdminId: null,
              acknowledgedByPersonId: null,
              resolvedAt: null,
              resolvedByAdminId: null,
              resolvedByPersonId: null,
              resolvedByRuntimeInvocationId: null,
              state,
            }
          : {}),
        domain: observation.domain,
        lastObservedAt: now,
        observation: observation.observation,
        occurrenceCount: { increment: 1 },
        severity: observation.severity,
        summaryCode: observation.summaryCode,
        version: { increment: 1 },
      },
    });
    await createHistory(
      transaction,
      actor,
      existing.id,
      reopened ? "REOPENED" : "OBSERVED",
      existing.state,
      state,
      { rule: observation.rule, ...observation.observation },
    );
    return reopened
      ? "reopened" as const
      : existing.state === "ACKNOWLEDGED"
        ? "acknowledged" as const
        : "observed" as const;
  }
  if (!existing || existing.state === "RESOLVED") {
    return "observed" as const;
  }
  const runtimeInvocationId = actor.runtimeAuthority?.invocationId ?? null;
  await transaction.platformAlert.update({
    where: { id: existing.id },
    data: {
      resolvedAt: now,
      resolvedByAdminId: runtimeInvocationId ? null : actor.userId,
      resolvedByPersonId: runtimeInvocationId ? null : actor.personId,
      resolvedByRuntimeInvocationId: runtimeInvocationId,
      state: "RESOLVED",
      version: { increment: 1 },
    },
  });
  await createHistory(
    transaction,
    actor,
    existing.id,
    "RESOLVED",
    existing.state,
    "RESOLVED",
    { rule: observation.rule, reason: "condition_cleared" },
  );
  return "resolved" as const;
}

async function createHistory(
  transaction: Prisma.TransactionClient,
  actor: MonitorActor,
  alertId: string,
  event: "OPENED" | "OBSERVED" | "REOPENED" | "RESOLVED",
  fromState: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | null,
  toState: "OPEN" | "ACKNOWLEDGED" | "RESOLVED",
  metadata: Prisma.InputJsonValue,
) {
  const runtimeInvocationId = actor.runtimeAuthority?.invocationId ?? null;
  await transaction.platformAlertHistory.create({
    data: {
      actorAdminUserId: runtimeInvocationId ? null : actor.userId,
      actorPersonId: runtimeInvocationId ? null : actor.personId,
      alertId,
      event,
      fromState,
      metadata,
      runtimeInvocationId,
      source: runtimeInvocationId ? "RUNTIME" : "ADMIN",
      toState,
    },
  });
}
