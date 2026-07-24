-- Gate 6D: Platform Operations Closure.
-- This forward-only migration creates durable runtime, rate-limit, alert,
-- incident, and audited operation state. It intentionally creates no rows.

CREATE TYPE "PlatformRuntimeProvider" AS ENUM (
  'GITHUB_ACTIONS_SCHEDULED_HTTP'
);

CREATE TYPE "PlatformRuntimeControlState" AS ENUM (
  'DISABLED',
  'ENABLED'
);

CREATE TYPE "PlatformRuntimeInvocationState" AS ENUM (
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'ABANDONED'
);

CREATE TYPE "PlatformOperationDomain" AS ENUM (
  'PLATFORM',
  'COMMERCE',
  'STORAGE',
  'MEDIA',
  'COMMUNICATIONS',
  'PAYMENTS',
  'SETTLEMENTS'
);

CREATE TYPE "PlatformSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

CREATE TYPE "PlatformAlertState" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED'
);

CREATE TYPE "PlatformIncidentState" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED'
);

CREATE TYPE "PlatformAlertRule" AS ENUM (
  'RUNTIME_STALE',
  'OVERDUE_JOBS',
  'EXPIRED_LEASES',
  'DEAD_LETTERED_JOBS',
  'DELAYED_SCHEDULES',
  'STORAGE_BACKLOG',
  'COMMUNICATION_BACKLOG',
  'PAYMENT_BACKLOG',
  'SETTLEMENT_GENERATION_STALE',
  'RATE_LIMIT_STORE_UNAVAILABLE'
);

CREATE TYPE "PlatformOperationEventSource" AS ENUM (
  'ADMIN',
  'RUNTIME'
);

CREATE TYPE "PlatformAlertHistoryEvent" AS ENUM (
  'OPENED',
  'OBSERVED',
  'ACKNOWLEDGED',
  'RESOLVED',
  'REOPENED'
);

CREATE TYPE "PlatformIncidentHistoryEvent" AS ENUM (
  'CREATED',
  'ACKNOWLEDGED',
  'RESOLVED',
  'REOPENED'
);

CREATE TYPE "PlatformOperationMutationAction" AS ENUM (
  'RUNTIME_INITIALIZE',
  'RUNTIME_ENABLE',
  'RUNTIME_DISABLE',
  'SCHEDULE_BOOTSTRAP',
  'ALERT_ACKNOWLEDGE',
  'ALERT_RESOLVE',
  'INCIDENT_CREATE',
  'INCIDENT_ACKNOWLEDGE',
  'INCIDENT_RESOLVE'
);

ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'COMMERCE_ORDER_EXPIRY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'PLATFORM_OPERATIONS_MONITOR';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'DISTRIBUTED_RATE_LIMIT_CLEANUP';

ALTER TYPE "PlatformJobType" ADD VALUE 'COMMERCE_ORDER_EXPIRY';
ALTER TYPE "PlatformJobType" ADD VALUE 'PLATFORM_OPERATIONS_MONITOR';
ALTER TYPE "PlatformJobType" ADD VALUE 'DISTRIBUTED_RATE_LIMIT_CLEANUP';

ALTER TABLE "PlatformJobSchedule"
  DROP CONSTRAINT "PlatformJobSchedule_mapping_check";
ALTER TABLE "PlatformJobSchedule"
  ADD CONSTRAINT "PlatformJobSchedule_mapping_check"
  CHECK (
    ("scheduleKey"::text = 'PLATFORM_HEALTH_PROBE' AND "jobType"::text = 'PLATFORM_HEALTH_PROBE')
    OR ("scheduleKey"::text = 'STORAGE_MAINTENANCE_DISCOVERY' AND "jobType"::text = 'STORAGE_MAINTENANCE_DISCOVERY')
    OR ("scheduleKey"::text = 'STORAGE_RESCAN_DISCOVERY' AND "jobType"::text = 'STORAGE_RESCAN_DISCOVERY')
    OR ("scheduleKey"::text = 'MEDIA_RENDITION_DISCOVERY' AND "jobType"::text = 'MEDIA_RENDITION_DISCOVERY')
    OR ("scheduleKey"::text = 'MEDIA_RENDITION_CLEANUP_DISCOVERY' AND "jobType"::text = 'MEDIA_RENDITION_CLEANUP_DISCOVERY')
    OR ("scheduleKey"::text = 'COMMUNICATION_CAMPAIGN_DISCOVERY' AND "jobType"::text = 'COMMUNICATION_CAMPAIGN_DISCOVERY')
    OR ("scheduleKey"::text = 'COMMUNICATION_DELIVERY_DISCOVERY' AND "jobType"::text = 'COMMUNICATION_DELIVERY_DISCOVERY')
    OR ("scheduleKey"::text = 'PAYMENT_RETRY_DISCOVERY' AND "jobType"::text = 'PAYMENT_RETRY_DISCOVERY')
    OR ("scheduleKey"::text = 'PAYMENT_RECONCILIATION' AND "jobType"::text = 'PAYMENT_RECONCILIATION')
    OR ("scheduleKey"::text = 'SETTLEMENT_STATEMENT_GENERATE' AND "jobType"::text = 'SETTLEMENT_STATEMENT_GENERATE')
    OR ("scheduleKey"::text = 'COMMERCE_ORDER_EXPIRY' AND "jobType"::text = 'COMMERCE_ORDER_EXPIRY')
    OR ("scheduleKey"::text = 'PLATFORM_OPERATIONS_MONITOR' AND "jobType"::text = 'PLATFORM_OPERATIONS_MONITOR')
    OR ("scheduleKey"::text = 'DISTRIBUTED_RATE_LIMIT_CLEANUP' AND "jobType"::text = 'DISTRIBUTED_RATE_LIMIT_CLEANUP')
  );

CREATE TABLE "DistributedRateLimitBucket" (
  "keyHash" VARCHAR(64) NOT NULL,
  "keyVersion" SMALLINT NOT NULL,
  "count" INTEGER NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(6) NOT NULL,
  "resetAt" TIMESTAMPTZ(6) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "DistributedRateLimitBucket_pkey" PRIMARY KEY ("keyHash"),
  CONSTRAINT "DistributedRateLimitBucket_keyHash_check"
    CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "DistributedRateLimitBucket_keyVersion_check"
    CHECK ("keyVersion" = 1),
  CONSTRAINT "DistributedRateLimitBucket_count_check"
    CHECK ("count" > 0),
  CONSTRAINT "DistributedRateLimitBucket_window_check"
    CHECK (
      "windowStartedAt" < "resetAt"
      AND "resetAt" <= "expiresAt"
      AND "expiresAt" <= "resetAt" + INTERVAL '7 days'
    )
);

CREATE TABLE "PlatformRuntimeControl" (
  "id" VARCHAR(32) NOT NULL,
  "provider" "PlatformRuntimeProvider" NOT NULL,
  "state" "PlatformRuntimeControlState" NOT NULL DEFAULT 'DISABLED',
  "expectedIntervalSeconds" INTEGER NOT NULL,
  "generation" BIGINT NOT NULL DEFAULT 1,
  "configuredByAdminUserId" TEXT NOT NULL,
  "configuredByPersonId" UUID NOT NULL,
  "enabledAt" TIMESTAMPTZ(6),
  "disabledAt" TIMESTAMPTZ(6),
  "lastInvocationAt" TIMESTAMPTZ(6),
  "lastSucceededAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PlatformRuntimeControl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformRuntimeControl_interval_check"
    CHECK ("expectedIntervalSeconds" BETWEEN 300 AND 86400),
  CONSTRAINT "PlatformRuntimeControl_generation_check"
    CHECK ("generation" > 0),
  CONSTRAINT "PlatformRuntimeControl_version_check"
    CHECK ("version" > 0),
  CONSTRAINT "PlatformRuntimeControl_state_check"
    CHECK (
      (
        "state" = 'ENABLED'
        AND "enabledAt" IS NOT NULL
        AND ("disabledAt" IS NULL OR "enabledAt" > "disabledAt")
      )
      OR
      (
        "state" = 'DISABLED'
        AND "disabledAt" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformRuntimeControl_observation_order_check"
    CHECK (
      ("lastInvocationAt" IS NULL OR "lastInvocationAt" >= "createdAt")
      AND ("lastSucceededAt" IS NULL OR "lastSucceededAt" >= "createdAt")
    )
);

CREATE TABLE "PlatformRuntimeInvocation" (
  "id" UUID NOT NULL,
  "controlId" VARCHAR(32) NOT NULL,
  "provider" "PlatformRuntimeProvider" NOT NULL,
  "state" "PlatformRuntimeInvocationState" NOT NULL DEFAULT 'RUNNING',
  "tokenJtiHash" VARCHAR(64) NOT NULL,
  "repositorySha" VARCHAR(40) NOT NULL,
  "workflowRefHash" VARCHAR(64) NOT NULL,
  "eventName" VARCHAR(32) NOT NULL,
  "gitRefHash" VARCHAR(64) NOT NULL,
  "requestedAt" TIMESTAMPTZ(6) NOT NULL,
  "controlGeneration" BIGINT NOT NULL,
  "leaseToken" UUID,
  "fencingToken" BIGINT NOT NULL DEFAULT 1,
  "leaseExpiresAt" TIMESTAMPTZ(6),
  "workerId" VARCHAR(96) NOT NULL,
  "schedulerCompletedAt" TIMESTAMPTZ(6),
  "workerCompletedAt" TIMESTAMPTZ(6),
  "monitorCompletedAt" TIMESTAMPTZ(6),
  "schedulerResult" JSONB,
  "workerResult" JSONB,
  "monitorResult" JSONB,
  "safeErrorCode" VARCHAR(64),
  "completedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PlatformRuntimeInvocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformRuntimeInvocation_hashes_check"
    CHECK (
      "tokenJtiHash" ~ '^[0-9a-f]{64}$'
      AND "repositorySha" ~ '^[0-9a-f]{40}$'
      AND "workflowRefHash" ~ '^[0-9a-f]{64}$'
      AND "gitRefHash" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "PlatformRuntimeInvocation_generation_check"
    CHECK ("controlGeneration" > 0 AND "fencingToken" > 0),
  CONSTRAINT "PlatformRuntimeInvocation_state_check"
    CHECK (
      (
        "state" = 'RUNNING'
        AND "leaseToken" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "completedAt" IS NULL
        AND "safeErrorCode" IS NULL
      )
      OR
      (
        "state" <> 'RUNNING'
        AND "leaseToken" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "completedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformRuntimeInvocation_phase_pairs_check"
    CHECK (
      (("schedulerCompletedAt" IS NULL) = ("schedulerResult" IS NULL))
      AND (("workerCompletedAt" IS NULL) = ("workerResult" IS NULL))
      AND (("monitorCompletedAt" IS NULL) = ("monitorResult" IS NULL))
    ),
  CONSTRAINT "PlatformRuntimeInvocation_result_size_check"
    CHECK (
      COALESCE(OCTET_LENGTH("schedulerResult"::TEXT), 0) <= 8192
      AND COALESCE(OCTET_LENGTH("workerResult"::TEXT), 0) <= 8192
      AND COALESCE(OCTET_LENGTH("monitorResult"::TEXT), 0) <= 8192
    )
);

CREATE TABLE "PlatformAlert" (
  "id" UUID NOT NULL,
  "deduplicationKey" VARCHAR(160) NOT NULL,
  "rule" "PlatformAlertRule" NOT NULL,
  "domain" "PlatformOperationDomain" NOT NULL,
  "severity" "PlatformSeverity" NOT NULL,
  "state" "PlatformAlertState" NOT NULL DEFAULT 'OPEN',
  "summaryCode" VARCHAR(80) NOT NULL,
  "observation" JSONB NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstObservedAt" TIMESTAMPTZ(6) NOT NULL,
  "lastObservedAt" TIMESTAMPTZ(6) NOT NULL,
  "acknowledgedByAdminId" TEXT,
  "acknowledgedByPersonId" UUID,
  "acknowledgedAt" TIMESTAMPTZ(6),
  "resolvedByAdminId" TEXT,
  "resolvedByPersonId" UUID,
  "resolvedByRuntimeInvocationId" UUID,
  "resolvedAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformAlert_deduplicationKey_check"
    CHECK ("deduplicationKey" ~ '^[a-z0-9:_-]{1,160}$'),
  CONSTRAINT "PlatformAlert_counts_check"
    CHECK ("occurrenceCount" > 0 AND "version" > 0),
  CONSTRAINT "PlatformAlert_observation_check"
    CHECK (
      "firstObservedAt" <= "lastObservedAt"
      AND OCTET_LENGTH("observation"::TEXT) <= 4096
    ),
  CONSTRAINT "PlatformAlert_acknowledgement_actor_check"
    CHECK (
      (
        "acknowledgedByAdminId" IS NULL
        AND "acknowledgedByPersonId" IS NULL
        AND "acknowledgedAt" IS NULL
      )
      OR
      (
        "acknowledgedByAdminId" IS NOT NULL
        AND "acknowledgedByPersonId" IS NOT NULL
        AND "acknowledgedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformAlert_resolution_actor_check"
    CHECK (
      (
        "resolvedByAdminId" IS NULL
        AND "resolvedByPersonId" IS NULL
        AND "resolvedByRuntimeInvocationId" IS NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "resolvedByAdminId" IS NOT NULL
        AND "resolvedByPersonId" IS NOT NULL
        AND "resolvedByRuntimeInvocationId" IS NULL
        AND "resolvedAt" IS NOT NULL
      )
      OR
      (
        "resolvedByAdminId" IS NULL
        AND "resolvedByPersonId" IS NULL
        AND "resolvedByRuntimeInvocationId" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformAlert_state_check"
    CHECK (
      (
        "state" = 'OPEN'
        AND "acknowledgedAt" IS NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "state" = 'ACKNOWLEDGED'
        AND "acknowledgedAt" IS NOT NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "state" = 'RESOLVED'
        AND "resolvedAt" IS NOT NULL
      )
    )
);

CREATE TABLE "PlatformAlertHistory" (
  "id" UUID NOT NULL,
  "alertId" UUID NOT NULL,
  "event" "PlatformAlertHistoryEvent" NOT NULL,
  "source" "PlatformOperationEventSource" NOT NULL,
  "fromState" "PlatformAlertState",
  "toState" "PlatformAlertState" NOT NULL,
  "actorAdminUserId" TEXT,
  "actorPersonId" UUID,
  "runtimeInvocationId" UUID,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformAlertHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformAlertHistory_actor_check"
    CHECK (
      (
        "source" = 'ADMIN'
        AND "actorAdminUserId" IS NOT NULL
        AND "actorPersonId" IS NOT NULL
        AND "runtimeInvocationId" IS NULL
      )
      OR
      (
        "source" = 'RUNTIME'
        AND "actorAdminUserId" IS NULL
        AND "actorPersonId" IS NULL
        AND "runtimeInvocationId" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformAlertHistory_transition_check"
    CHECK (
      ("event" = 'OPENED' AND "fromState" IS NULL AND "toState" = 'OPEN')
      OR
      (
        "event" = 'OBSERVED'
        AND "fromState" IS NOT NULL
        AND "fromState" = "toState"
      )
      OR
      (
        "event" = 'ACKNOWLEDGED'
        AND "fromState" = 'OPEN'
        AND "toState" = 'ACKNOWLEDGED'
      )
      OR
      (
        "event" = 'RESOLVED'
        AND "fromState" IN ('OPEN', 'ACKNOWLEDGED')
        AND "toState" = 'RESOLVED'
      )
      OR
      (
        "event" = 'REOPENED'
        AND "fromState" = 'RESOLVED'
        AND "toState" = 'OPEN'
      )
    ),
  CONSTRAINT "PlatformAlertHistory_metadata_check"
    CHECK (OCTET_LENGTH("metadata"::TEXT) <= 4096)
);

CREATE TABLE "PlatformIncident" (
  "id" UUID NOT NULL,
  "sourceAlertId" UUID NOT NULL,
  "deduplicationKey" VARCHAR(160) NOT NULL,
  "domain" "PlatformOperationDomain" NOT NULL,
  "severity" "PlatformSeverity" NOT NULL,
  "state" "PlatformIncidentState" NOT NULL DEFAULT 'OPEN',
  "summaryCode" VARCHAR(80) NOT NULL,
  "acknowledgedByAdminId" TEXT,
  "acknowledgedByPersonId" UUID,
  "acknowledgedAt" TIMESTAMPTZ(6),
  "resolvedByAdminId" TEXT,
  "resolvedByPersonId" UUID,
  "resolvedAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PlatformIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformIncident_deduplicationKey_check"
    CHECK ("deduplicationKey" ~ '^[a-z0-9:_-]{1,160}$'),
  CONSTRAINT "PlatformIncident_version_check"
    CHECK ("version" > 0),
  CONSTRAINT "PlatformIncident_acknowledgement_actor_check"
    CHECK (
      (
        "acknowledgedByAdminId" IS NULL
        AND "acknowledgedByPersonId" IS NULL
        AND "acknowledgedAt" IS NULL
      )
      OR
      (
        "acknowledgedByAdminId" IS NOT NULL
        AND "acknowledgedByPersonId" IS NOT NULL
        AND "acknowledgedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformIncident_resolution_actor_check"
    CHECK (
      (
        "resolvedByAdminId" IS NULL
        AND "resolvedByPersonId" IS NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "resolvedByAdminId" IS NOT NULL
        AND "resolvedByPersonId" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformIncident_state_check"
    CHECK (
      (
        "state" = 'OPEN'
        AND "acknowledgedAt" IS NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "state" = 'ACKNOWLEDGED'
        AND "acknowledgedAt" IS NOT NULL
        AND "resolvedAt" IS NULL
      )
      OR
      (
        "state" = 'RESOLVED'
        AND "resolvedAt" IS NOT NULL
      )
    )
);

CREATE TABLE "PlatformIncidentHistory" (
  "id" UUID NOT NULL,
  "incidentId" UUID NOT NULL,
  "event" "PlatformIncidentHistoryEvent" NOT NULL,
  "source" "PlatformOperationEventSource" NOT NULL,
  "fromState" "PlatformIncidentState",
  "toState" "PlatformIncidentState" NOT NULL,
  "actorAdminUserId" TEXT,
  "actorPersonId" UUID,
  "runtimeInvocationId" UUID,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformIncidentHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformIncidentHistory_actor_check"
    CHECK (
      (
        "source" = 'ADMIN'
        AND "actorAdminUserId" IS NOT NULL
        AND "actorPersonId" IS NOT NULL
        AND "runtimeInvocationId" IS NULL
      )
      OR
      (
        "source" = 'RUNTIME'
        AND "actorAdminUserId" IS NULL
        AND "actorPersonId" IS NULL
        AND "runtimeInvocationId" IS NOT NULL
      )
    ),
  CONSTRAINT "PlatformIncidentHistory_transition_check"
    CHECK (
      ("event" = 'CREATED' AND "fromState" IS NULL AND "toState" = 'OPEN')
      OR
      (
        "event" = 'ACKNOWLEDGED'
        AND "fromState" = 'OPEN'
        AND "toState" = 'ACKNOWLEDGED'
      )
      OR
      (
        "event" = 'RESOLVED'
        AND "fromState" IN ('OPEN', 'ACKNOWLEDGED')
        AND "toState" = 'RESOLVED'
      )
      OR
      (
        "event" = 'REOPENED'
        AND "fromState" = 'RESOLVED'
        AND "toState" = 'OPEN'
      )
    ),
  CONSTRAINT "PlatformIncidentHistory_metadata_check"
    CHECK (OCTET_LENGTH("metadata"::TEXT) <= 4096)
);

CREATE TABLE "PlatformOperationMutation" (
  "id" UUID NOT NULL,
  "actorAdminUserId" TEXT NOT NULL,
  "actorPersonId" UUID NOT NULL,
  "action" "PlatformOperationMutationAction" NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "runtimeControlId" VARCHAR(32),
  "scheduleId" UUID,
  "alertId" UUID,
  "incidentId" UUID,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformOperationMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformOperationMutation_requestHash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PlatformOperationMutation_result_check"
    CHECK (OCTET_LENGTH("result"::TEXT) <= 8192),
  CONSTRAINT "PlatformOperationMutation_target_check"
    CHECK (
      (
        "action" IN (
          'RUNTIME_INITIALIZE',
          'RUNTIME_ENABLE',
          'RUNTIME_DISABLE'
        )
        AND "runtimeControlId" IS NOT NULL
        AND "scheduleId" IS NULL
        AND "alertId" IS NULL
        AND "incidentId" IS NULL
      )
      OR
      (
        "action" = 'SCHEDULE_BOOTSTRAP'
        AND "runtimeControlId" IS NULL
        AND "scheduleId" IS NOT NULL
        AND "alertId" IS NULL
        AND "incidentId" IS NULL
      )
      OR
      (
        "action" IN ('ALERT_ACKNOWLEDGE', 'ALERT_RESOLVE')
        AND "runtimeControlId" IS NULL
        AND "scheduleId" IS NULL
        AND "alertId" IS NOT NULL
        AND "incidentId" IS NULL
      )
      OR
      (
        "action" IN (
          'INCIDENT_CREATE',
          'INCIDENT_ACKNOWLEDGE',
          'INCIDENT_RESOLVE'
        )
        AND "runtimeControlId" IS NULL
        AND "scheduleId" IS NULL
        AND "alertId" IS NULL
        AND "incidentId" IS NOT NULL
      )
    )
);

CREATE INDEX "DistributedRateLimitBucket_expiresAt_keyHash_idx"
  ON "DistributedRateLimitBucket"("expiresAt", "keyHash");
CREATE INDEX "DistributedRateLimitBucket_resetAt_keyHash_idx"
  ON "DistributedRateLimitBucket"("resetAt", "keyHash");
CREATE INDEX "PlatformRuntimeControl_state_lastSucceededAt_id_idx"
  ON "PlatformRuntimeControl"("state", "lastSucceededAt", "id");
CREATE UNIQUE INDEX "PlatformRuntimeInvocation_tokenJtiHash_key"
  ON "PlatformRuntimeInvocation"("tokenJtiHash");
CREATE INDEX "PlatformRuntimeInvocation_state_leaseExpiresAt_id_idx"
  ON "PlatformRuntimeInvocation"("state", "leaseExpiresAt", "id");
CREATE INDEX "PlatformRuntimeInvocation_controlId_createdAt_id_idx"
  ON "PlatformRuntimeInvocation"("controlId", "createdAt", "id");
CREATE INDEX "PlatformRuntimeInvocation_completedAt_id_idx"
  ON "PlatformRuntimeInvocation"("completedAt", "id");
CREATE UNIQUE INDEX "PlatformAlert_deduplicationKey_key"
  ON "PlatformAlert"("deduplicationKey");
CREATE INDEX "PlatformAlert_state_severity_lastObservedAt_id_idx"
  ON "PlatformAlert"("state", "severity", "lastObservedAt", "id");
CREATE INDEX "PlatformAlert_domain_state_lastObservedAt_id_idx"
  ON "PlatformAlert"("domain", "state", "lastObservedAt", "id");
CREATE INDEX "PlatformAlert_createdAt_id_idx"
  ON "PlatformAlert"("createdAt", "id");
CREATE INDEX "PlatformAlertHistory_alertId_createdAt_id_idx"
  ON "PlatformAlertHistory"("alertId", "createdAt", "id");
CREATE INDEX "PlatformAlertHistory_createdAt_id_idx"
  ON "PlatformAlertHistory"("createdAt", "id");
CREATE UNIQUE INDEX "PlatformIncident_sourceAlertId_key"
  ON "PlatformIncident"("sourceAlertId");
CREATE UNIQUE INDEX "PlatformIncident_deduplicationKey_key"
  ON "PlatformIncident"("deduplicationKey");
CREATE INDEX "PlatformIncident_state_severity_updatedAt_id_idx"
  ON "PlatformIncident"("state", "severity", "updatedAt", "id");
CREATE INDEX "PlatformIncident_domain_state_updatedAt_id_idx"
  ON "PlatformIncident"("domain", "state", "updatedAt", "id");
CREATE INDEX "PlatformIncident_createdAt_id_idx"
  ON "PlatformIncident"("createdAt", "id");
CREATE INDEX "PlatformIncidentHistory_incidentId_createdAt_id_idx"
  ON "PlatformIncidentHistory"("incidentId", "createdAt", "id");
CREATE INDEX "PlatformIncidentHistory_createdAt_id_idx"
  ON "PlatformIncidentHistory"("createdAt", "id");
CREATE INDEX "PlatformOperationMutation_runtimeControlId_action_createdAt_idx"
  ON "PlatformOperationMutation"("runtimeControlId", "action", "createdAt", "id");
CREATE INDEX "PlatformOperationMutation_scheduleId_action_createdAt_id_idx"
  ON "PlatformOperationMutation"("scheduleId", "action", "createdAt", "id");
CREATE INDEX "PlatformOperationMutation_alertId_action_createdAt_id_idx"
  ON "PlatformOperationMutation"("alertId", "action", "createdAt", "id");
CREATE INDEX "PlatformOperationMutation_incidentId_action_createdAt_id_idx"
  ON "PlatformOperationMutation"("incidentId", "action", "createdAt", "id");
CREATE INDEX "PlatformOperationMutation_actorAdminUserId_createdAt_id_idx"
  ON "PlatformOperationMutation"("actorAdminUserId", "createdAt", "id");
CREATE UNIQUE INDEX "PlatformOperationMutation_actorAdminUserId_idempotencyKey_key"
  ON "PlatformOperationMutation"("actorAdminUserId", "idempotencyKey");

ALTER TABLE "PlatformRuntimeControl"
  ADD CONSTRAINT "PlatformRuntimeControl_configuredByAdminUserId_fkey"
  FOREIGN KEY ("configuredByAdminUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformRuntimeControl"
  ADD CONSTRAINT "PlatformRuntimeControl_configuredByPersonId_fkey"
  FOREIGN KEY ("configuredByPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformRuntimeInvocation"
  ADD CONSTRAINT "PlatformRuntimeInvocation_controlId_fkey"
  FOREIGN KEY ("controlId") REFERENCES "PlatformRuntimeControl"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlert"
  ADD CONSTRAINT "PlatformAlert_acknowledgedByAdminId_fkey"
  FOREIGN KEY ("acknowledgedByAdminId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlert"
  ADD CONSTRAINT "PlatformAlert_acknowledgedByPersonId_fkey"
  FOREIGN KEY ("acknowledgedByPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlert"
  ADD CONSTRAINT "PlatformAlert_resolvedByAdminId_fkey"
  FOREIGN KEY ("resolvedByAdminId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlert"
  ADD CONSTRAINT "PlatformAlert_resolvedByPersonId_fkey"
  FOREIGN KEY ("resolvedByPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlert"
  ADD CONSTRAINT "PlatformAlert_resolvedByRuntimeInvocationId_fkey"
  FOREIGN KEY ("resolvedByRuntimeInvocationId") REFERENCES "PlatformRuntimeInvocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlertHistory"
  ADD CONSTRAINT "PlatformAlertHistory_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "PlatformAlert"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlertHistory"
  ADD CONSTRAINT "PlatformAlertHistory_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlertHistory"
  ADD CONSTRAINT "PlatformAlertHistory_actorPersonId_fkey"
  FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAlertHistory"
  ADD CONSTRAINT "PlatformAlertHistory_runtimeInvocationId_fkey"
  FOREIGN KEY ("runtimeInvocationId") REFERENCES "PlatformRuntimeInvocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncident"
  ADD CONSTRAINT "PlatformIncident_sourceAlertId_fkey"
  FOREIGN KEY ("sourceAlertId") REFERENCES "PlatformAlert"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncident"
  ADD CONSTRAINT "PlatformIncident_acknowledgedByAdminId_fkey"
  FOREIGN KEY ("acknowledgedByAdminId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncident"
  ADD CONSTRAINT "PlatformIncident_acknowledgedByPersonId_fkey"
  FOREIGN KEY ("acknowledgedByPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncident"
  ADD CONSTRAINT "PlatformIncident_resolvedByAdminId_fkey"
  FOREIGN KEY ("resolvedByAdminId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncident"
  ADD CONSTRAINT "PlatformIncident_resolvedByPersonId_fkey"
  FOREIGN KEY ("resolvedByPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncidentHistory"
  ADD CONSTRAINT "PlatformIncidentHistory_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "PlatformIncident"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncidentHistory"
  ADD CONSTRAINT "PlatformIncidentHistory_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncidentHistory"
  ADD CONSTRAINT "PlatformIncidentHistory_actorPersonId_fkey"
  FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIncidentHistory"
  ADD CONSTRAINT "PlatformIncidentHistory_runtimeInvocationId_fkey"
  FOREIGN KEY ("runtimeInvocationId") REFERENCES "PlatformRuntimeInvocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformOperationMutation"
  ADD CONSTRAINT "PlatformOperationMutation_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformOperationMutation"
  ADD CONSTRAINT "PlatformOperationMutation_actorPersonId_fkey"
  FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformOperationMutation"
  ADD CONSTRAINT "PlatformOperationMutation_runtimeControlId_fkey"
  FOREIGN KEY ("runtimeControlId") REFERENCES "PlatformRuntimeControl"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformOperationMutation"
  ADD CONSTRAINT "PlatformOperationMutation_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "PlatformJobSchedule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformOperationMutation"
  ADD CONSTRAINT "PlatformOperationMutation_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "PlatformAlert"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformOperationMutation"
  ADD CONSTRAINT "PlatformOperationMutation_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "PlatformIncident"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_platform_operations_history_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform operations history is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "PlatformAlertHistory_append_only"
  BEFORE UPDATE OR DELETE ON "PlatformAlertHistory"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_platform_operations_history_mutation"();

CREATE TRIGGER "PlatformIncidentHistory_append_only"
  BEFORE UPDATE OR DELETE ON "PlatformIncidentHistory"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_platform_operations_history_mutation"();

CREATE TRIGGER "PlatformOperationMutation_append_only"
  BEFORE UPDATE OR DELETE ON "PlatformOperationMutation"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_platform_operations_history_mutation"();
