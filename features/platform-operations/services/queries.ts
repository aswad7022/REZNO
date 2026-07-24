import "server-only";

import {
  PlatformAlertState,
  PlatformIncidentState,
  PlatformOperationDomain,
  PlatformSeverity,
  Prisma,
} from "@prisma/client";

import { communicationProviderConfigurationTruth } from "@/features/communications/providers/provider";
import { paymentProvider } from "@/features/payments/providers/registry";
import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  assertPlatformJobAdminCurrent,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import {
  decodePlatformOperationsCursor,
  encodePlatformOperationsCursor,
  platformOperationsCursorBinding,
} from "@/features/platform-operations/domain/cursor";
import { PLATFORM_RUNTIME_CONTROL_ID } from "@/features/platform-operations/services/runtime";
import { configuredStorageProvider } from "@/features/storage/providers/registry";
import { getExactPostgresTime } from "@/lib/db/postgres-timestamp";

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;
const METRIC_CAP = 100;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ListInput<S> {
  cursor?: string;
  domain?: PlatformOperationDomain;
  limit?: number;
  severity?: PlatformSeverity;
  state?: S;
}

export async function getPlatformOperationsOverview(
  context: PlatformJobAdminContext,
) {
  return runPlatformJobSerializable(async (transaction) => {
    await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_VIEW",
    );
    const [control, invocations, counts] = await Promise.all([
      transaction.platformRuntimeControl.findUnique({
        where: { id: PLATFORM_RUNTIME_CONTROL_ID },
      }),
      transaction.platformRuntimeInvocation.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          completedAt: true,
          createdAt: true,
          id: true,
          repositorySha: true,
          safeErrorCode: true,
          state: true,
        },
        take: 10,
      }),
      transaction.$queryRaw<Array<{
        activeLeases: number;
        activeRateBuckets: number;
        communicationBacklog: number;
        communicationFailures: number;
        deadLetteredJobs: number;
        delayedSchedules: number;
        disabledSchedules: number;
        expiredLeases: number;
        expiredRateBuckets: number;
        openAlerts: number;
        openIncidents: number;
        overdueJobs: number;
        paymentBacklog: number;
        renditionBacklog: number;
        retryWaitJobs: number;
        runtimeStale: number;
        settlementGenerationStale: number;
        storageBacklog: number;
      }>>(Prisma.sql`
        SELECT
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJob"
              WHERE "status" IN ('SCHEDULED', 'AVAILABLE', 'RETRY_WAIT')
                AND "availableAt" <= clock_timestamp()
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "overdueJobs",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJob"
              WHERE "status" = 'RETRY_WAIT'
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "retryWaitJobs",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJob"
              WHERE "status" IN ('CLAIMED', 'RUNNING')
                AND "leaseExpiresAt" > clock_timestamp()
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "activeLeases",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJob"
              WHERE "status" IN ('CLAIMED', 'RUNNING')
                AND "leaseExpiresAt" <= clock_timestamp()
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "expiredLeases",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJob"
              WHERE "status" = 'DEAD_LETTERED'
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "deadLetteredJobs",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJobSchedule"
              WHERE "enabled" IS FALSE
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "disabledSchedules",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformJobSchedule"
              WHERE "enabled" IS TRUE
                AND "nextRunAt"
                  < clock_timestamp() - ("cadenceSeconds" * INTERVAL '1 second')
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "delayedSchedules",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "UploadSession"
              WHERE "state" IN ('CREATED', 'TARGET_ISSUED', 'UPLOADED', 'FAILED')
                AND "expiresAt" <= clock_timestamp()
              UNION ALL
              SELECT 1 FROM "StoredAsset"
              WHERE "state" IN ('DELETE_PENDING', 'PENDING_INSPECTION')
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "storageBacklog",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "MediaRendition"
              WHERE "state" IN ('PENDING', 'FAILED', 'DELETE_PENDING')
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "renditionBacklog",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "CommunicationCampaign"
              WHERE "status" = 'SCHEDULED'
                AND "scheduledAt" <= clock_timestamp()
              UNION ALL
              SELECT 1 FROM "OutboundDelivery"
              WHERE "status" IN ('PENDING', 'RETRY_SCHEDULED')
                AND (
                  "nextAttemptAt" IS NULL
                  OR "nextAttemptAt" <= clock_timestamp()
                )
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "communicationBacklog",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "OutboundDelivery"
              WHERE "status" = 'PERMANENT_FAILURE'
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "communicationFailures",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PaymentAttempt"
              WHERE "status" = 'FAILED'
                AND "retryable" IS TRUE
                AND "nextRetryAt" <= clock_timestamp()
              UNION ALL
              SELECT 1 FROM "PaymentRefund"
              WHERE "status" = 'FAILED'
                AND "retryable" IS TRUE
                AND "nextRetryAt" <= clock_timestamp()
              UNION ALL
              SELECT 1 FROM "PaymentProviderEvent"
              WHERE "status" = 'VERIFIED'
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "paymentBacklog",
          CASE WHEN EXISTS (
            SELECT 1 FROM "PlatformJobSchedule"
            WHERE "scheduleKey" = 'SETTLEMENT_STATEMENT_GENERATE'
              AND "enabled" IS TRUE
              AND "nextRunAt"
                < clock_timestamp() - ("cadenceSeconds" * INTERVAL '1 second')
            LIMIT 1
          ) THEN 1 ELSE 0 END::int AS "settlementGenerationStale",
          CASE WHEN EXISTS (
            SELECT 1 FROM "PlatformRuntimeControl"
            WHERE "state" = 'ENABLED'
              AND (
                "lastSucceededAt" IS NULL
                OR "lastSucceededAt"
                  < clock_timestamp()
                    - ("expectedIntervalSeconds" * 3 * INTERVAL '1 second')
              )
            LIMIT 1
          ) THEN 1 ELSE 0 END::int AS "runtimeStale",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "DistributedRateLimitBucket"
              WHERE "expiresAt" > clock_timestamp()
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "activeRateBuckets",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "DistributedRateLimitBucket"
              WHERE "expiresAt" <= clock_timestamp()
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "expiredRateBuckets",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformAlert"
              WHERE "state" <> 'RESOLVED'
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "openAlerts",
          (
            SELECT COUNT(*)::int FROM (
              SELECT 1 FROM "PlatformIncident"
              WHERE "state" <> 'RESOLVED'
              LIMIT ${METRIC_CAP + 1}
            ) bounded
          ) AS "openIncidents"
      `),
    ]);
    const metric = counts[0];
    if (!metric) {
      platformJobError(
        "PLATFORM_JOB_FAILURE",
        "The platform operations metrics are unavailable.",
      );
    }
    return {
      metrics: Object.fromEntries(
        Object.entries(metric).map(([key, value]) => [
          key,
          {
            count: Math.min(value, METRIC_CAP),
            saturated: value > METRIC_CAP,
          },
        ]),
      ),
      providers: {
        communications: communicationProviderConfigurationTruth(),
        payment: paymentProvider().kind,
        storage: configuredStorageProvider().kind,
      },
      rateLimit: {
        availability: "AVAILABLE" as const,
        backend:
          process.env.NODE_ENV === "production"
          || process.env.REZNO_RATE_LIMIT_BACKEND === "postgres"
            ? "POSTGRESQL"
            : "LOCAL_MEMORY",
        failMode: "CLOSED",
        keyVersion: 1,
      },
      runtime: control
        ? {
            connection:
              control.state === "ENABLED"
              && control.lastSucceededAt
              && metric.runtimeStale === 0
                ? "CONNECTED" as const
                : "NOT_CONNECTED" as const,
            configured: true,
            expectedIntervalSeconds: control.expectedIntervalSeconds,
            generation: control.generation.toString(),
            lastInvocationAt: control.lastInvocationAt?.toISOString() ?? null,
            lastSucceededAt: control.lastSucceededAt?.toISOString() ?? null,
            state: control.state,
            version: control.version,
          }
        : {
            connection: "NOT_CONNECTED" as const,
            configured: false,
            expectedIntervalSeconds: null,
            generation: null,
            lastInvocationAt: null,
            lastSucceededAt: null,
            state: "NOT_CONFIGURED" as const,
            version: null,
          },
      runtimeInvocations: invocations.map((invocation) => ({
        completedAt: invocation.completedAt?.toISOString() ?? null,
        createdAt: invocation.createdAt.toISOString(),
        id: invocation.id,
        repositoryRevision: invocation.repositorySha.slice(0, 12),
        safeErrorCode: invocation.safeErrorCode,
        state: invocation.state,
      })),
    };
  });
}

export async function listPlatformAlerts(
  context: PlatformJobAdminContext,
  input: ListInput<PlatformAlertState> = {},
) {
  return listOperations(
    context,
    "PLATFORM_ALERT",
    input,
    async ({ adminScope, cursor, filter, limit, snapshot, transaction }) => {
      const conditions = [
        Prisma.sql`alert."createdAt" <= CAST(${snapshot} AS timestamptz)`,
      ];
      if (input.domain) {
        conditions.push(
          Prisma.sql`alert."domain" = CAST(${input.domain} AS "PlatformOperationDomain")`,
        );
      }
      if (input.severity) {
        conditions.push(
          Prisma.sql`alert."severity" = CAST(${input.severity} AS "PlatformSeverity")`,
        );
      }
      if (input.state) {
        conditions.push(
          Prisma.sql`alert."state" = CAST(${input.state} AS "PlatformAlertState")`,
        );
      }
      if (cursor) {
        conditions.push(Prisma.sql`(
          alert."createdAt" < CAST(${cursor.sortValue} AS timestamptz)
          OR (
            alert."createdAt" = CAST(${cursor.sortValue} AS timestamptz)
            AND alert."id" < CAST(${cursor.id} AS uuid)
          )
        )`);
      }
      const rows = await transaction.$queryRaw<Array<{
        createdAtExact: string;
        domain: PlatformOperationDomain;
        firstObservedAt: Date;
        id: string;
        incidentId: string | null;
        lastObservedAt: Date;
        occurrenceCount: number;
        rule: string;
        severity: PlatformSeverity;
        state: PlatformAlertState;
        summaryCode: string;
        version: number;
      }>>(Prisma.sql`
        SELECT
          alert."id",
          incident."id" AS "incidentId",
          alert."rule"::text AS "rule",
          alert."domain",
          alert."severity",
          alert."state",
          alert."summaryCode",
          alert."occurrenceCount",
          alert."firstObservedAt",
          alert."lastObservedAt",
          alert."version",
          to_char(
            alert."createdAt" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ) AS "createdAtExact"
        FROM "PlatformAlert" AS alert
        LEFT JOIN "PlatformIncident" AS incident
          ON incident."sourceAlertId" = alert."id"
        WHERE ${Prisma.join(conditions, " AND ")}
        ORDER BY alert."createdAt" DESC, alert."id" DESC
        LIMIT ${limit + 1}
      `);
      const anchor = rows.length > limit ? rows[limit - 1] : null;
      return {
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          firstObservedAt: row.firstObservedAt.toISOString(),
          lastObservedAt: row.lastObservedAt.toISOString(),
        })),
        nextCursor: anchor
          ? encodePlatformOperationsCursor("PLATFORM_ALERT", {
              adminScope,
              filter,
              id: anchor.id,
              pageSize: limit,
              snapshot,
              sortValue: anchor.createdAtExact,
            })
          : null,
      };
    },
  );
}

export async function listPlatformIncidents(
  context: PlatformJobAdminContext,
  input: ListInput<PlatformIncidentState> = {},
) {
  return listOperations(
    context,
    "PLATFORM_INCIDENT",
    input,
    async ({ adminScope, cursor, filter, limit, snapshot, transaction }) => {
      const conditions = [
        Prisma.sql`incident."createdAt" <= CAST(${snapshot} AS timestamptz)`,
      ];
      if (input.domain) {
        conditions.push(
          Prisma.sql`incident."domain" = CAST(${input.domain} AS "PlatformOperationDomain")`,
        );
      }
      if (input.severity) {
        conditions.push(
          Prisma.sql`incident."severity" = CAST(${input.severity} AS "PlatformSeverity")`,
        );
      }
      if (input.state) {
        conditions.push(
          Prisma.sql`incident."state" = CAST(${input.state} AS "PlatformIncidentState")`,
        );
      }
      if (cursor) {
        conditions.push(Prisma.sql`(
          incident."createdAt" < CAST(${cursor.sortValue} AS timestamptz)
          OR (
            incident."createdAt" = CAST(${cursor.sortValue} AS timestamptz)
            AND incident."id" < CAST(${cursor.id} AS uuid)
          )
        )`);
      }
      const rows = await transaction.$queryRaw<Array<{
        createdAtExact: string;
        domain: PlatformOperationDomain;
        id: string;
        severity: PlatformSeverity;
        sourceAlertId: string;
        state: PlatformIncidentState;
        summaryCode: string;
        updatedAt: Date;
        version: number;
      }>>(Prisma.sql`
        SELECT
          incident."id",
          incident."sourceAlertId",
          incident."domain",
          incident."severity",
          incident."state",
          incident."summaryCode",
          incident."updatedAt",
          incident."version",
          to_char(
            incident."createdAt" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ) AS "createdAtExact"
        FROM "PlatformIncident" AS incident
        WHERE ${Prisma.join(conditions, " AND ")}
        ORDER BY incident."createdAt" DESC, incident."id" DESC
        LIMIT ${limit + 1}
      `);
      const anchor = rows.length > limit ? rows[limit - 1] : null;
      return {
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
        })),
        nextCursor: anchor
          ? encodePlatformOperationsCursor("PLATFORM_INCIDENT", {
              adminScope,
              filter,
              id: anchor.id,
              pageSize: limit,
              snapshot,
              sortValue: anchor.createdAtExact,
            })
          : null,
      };
    },
  );
}

export async function getPlatformAlertDetail(
  context: PlatformJobAdminContext,
  alertId: string,
) {
  assertUuid(alertId);
  return runPlatformJobSerializable(async (transaction) => {
    await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_VIEW",
    );
    const alert = await transaction.platformAlert.findUnique({
      where: { id: alertId },
      include: {
        history: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        },
        incident: {
          select: { id: true, state: true, version: true },
        },
      },
    });
    if (!alert) platformJobError("NOT_FOUND", "The platform alert was not found.");
    return {
      domain: alert.domain,
      firstObservedAt: alert.firstObservedAt.toISOString(),
      history: alert.history.map((item) => ({
        createdAt: item.createdAt.toISOString(),
        event: item.event,
        fromState: item.fromState,
        source: item.source,
        toState: item.toState,
      })),
      id: alert.id,
      incident: alert.incident,
      lastObservedAt: alert.lastObservedAt.toISOString(),
      observation: safePlatformObservation(alert.observation),
      occurrenceCount: alert.occurrenceCount,
      rule: alert.rule,
      severity: alert.severity,
      state: alert.state,
      summaryCode: alert.summaryCode,
      version: alert.version,
    };
  });
}

export async function getPlatformIncidentDetail(
  context: PlatformJobAdminContext,
  incidentId: string,
) {
  assertUuid(incidentId);
  return runPlatformJobSerializable(async (transaction) => {
    await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_VIEW",
    );
    const incident = await transaction.platformIncident.findUnique({
      where: { id: incidentId },
      include: {
        history: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        },
        sourceAlert: {
          select: {
            id: true,
            rule: true,
            state: true,
            version: true,
          },
        },
      },
    });
    if (!incident) {
      platformJobError("NOT_FOUND", "The platform incident was not found.");
    }
    return {
      createdAt: incident.createdAt.toISOString(),
      domain: incident.domain,
      history: incident.history.map((item) => ({
        createdAt: item.createdAt.toISOString(),
        event: item.event,
        fromState: item.fromState,
        source: item.source,
        toState: item.toState,
      })),
      id: incident.id,
      severity: incident.severity,
      sourceAlert: incident.sourceAlert,
      state: incident.state,
      summaryCode: incident.summaryCode,
      updatedAt: incident.updatedAt.toISOString(),
      version: incident.version,
    };
  });
}

async function listOperations<S, R>(
  context: PlatformJobAdminContext,
  kind: "PLATFORM_ALERT" | "PLATFORM_INCIDENT",
  input: ListInput<S>,
  query: (value: {
    adminScope: string;
    cursor: ReturnType<typeof decodePlatformOperationsCursor> | null;
    filter: string;
    limit: number;
    snapshot: string;
    transaction: Prisma.TransactionClient;
  }) => Promise<R>,
) {
  const limit = input.limit ?? DEFAULT_PAGE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
    platformJobError("VALIDATION_ERROR", "The operations page size is invalid.");
  }
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_VIEW",
    );
    const authoritativeNow = await getExactPostgresTime(transaction);
    const adminScope = platformJobHash({
      adminAccessId: current.adminAccessId,
      source: current.source,
      userId: current.userId,
    });
    const filter = platformOperationsCursorBinding({
      domain: input.domain ?? null,
      severity: input.severity ?? null,
      state: input.state ?? null,
    });
    const cursor = input.cursor
      ? decodePlatformOperationsCursor(
          kind,
          input.cursor,
          { adminScope, filter, pageSize: limit },
          authoritativeNow,
        )
      : null;
    return query({
      adminScope,
      cursor,
      filter,
      limit,
      snapshot: cursor?.snapshot ?? authoritativeNow,
      transaction,
    });
  });
}

function assertUuid(value: string) {
  if (!UUID.test(value)) {
    platformJobError("VALIDATION_ERROR", "The platform operation ID is invalid.");
  }
}

function safePlatformObservation(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    platformJobError("CONFLICT", "The stored platform observation is invalid.");
  }
  const observation = value as Record<string, unknown>;
  const keys = Object.keys(observation).sort();
  if (
    keys.join(",") !== "count,saturated"
    || !Number.isInteger(observation.count)
    || Number(observation.count) < 0
    || Number(observation.count) > METRIC_CAP
    || typeof observation.saturated !== "boolean"
  ) {
    platformJobError("CONFLICT", "The stored platform observation is invalid.");
  }
  return {
    count: Number(observation.count),
    saturated: observation.saturated,
  };
}
