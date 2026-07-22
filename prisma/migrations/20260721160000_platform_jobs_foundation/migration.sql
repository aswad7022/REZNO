-- Gate 6A: PostgreSQL is the durable source of truth. This migration creates
-- no jobs, schedules, actors, or business rows.

CREATE TYPE "PlatformJobType" AS ENUM ('PLATFORM_HEALTH_PROBE');
CREATE TYPE "PlatformJobStatus" AS ENUM (
  'SCHEDULED',
  'AVAILABLE',
  'CLAIMED',
  'RUNNING',
  'SUCCEEDED',
  'RETRY_WAIT',
  'FAILED',
  'DEAD_LETTERED',
  'CANCELLED'
);
CREATE TYPE "PlatformJobSource" AS ENUM ('ADMIN_MANUAL', 'SCHEDULE');
CREATE TYPE "PlatformJobAttemptStatus" AS ENUM (
  'CLAIMED',
  'RUNNING',
  'SUCCEEDED',
  'RETRY_SCHEDULED',
  'FAILED',
  'DEAD_LETTERED',
  'LEASE_EXPIRED',
  'CANCELLED'
);
CREATE TYPE "PlatformJobErrorCode" AS ENUM (
  'LEASE_EXPIRED',
  'HANDLER_TIMEOUT',
  'HANDLER_ABORTED',
  'HANDLER_EXCEPTION',
  'TRANSIENT_FAILURE',
  'PERMANENT_FAILURE'
);
CREATE TYPE "PlatformJobScheduleKey" AS ENUM ('PLATFORM_HEALTH_PROBE');
CREATE TYPE "PlatformJobMutationAction" AS ENUM (
  'MANUAL_TRIGGER',
  'CANCEL',
  'REQUEUE',
  'SCHEDULE_ENABLE',
  'SCHEDULE_DISABLE',
  'WORKER_BATCH',
  'SCHEDULER_TICK'
);

CREATE TABLE "PlatformJobSchedule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scheduleKey" "PlatformJobScheduleKey" NOT NULL,
  "jobType" "PlatformJobType" NOT NULL,
  "payloadVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" VARCHAR(64) NOT NULL,
  "scopeKey" VARCHAR(64) NOT NULL,
  "organizationId" UUID,
  "createdByAdminUserId" TEXT NOT NULL,
  "createdByPersonId" UUID NOT NULL,
  "cadenceSeconds" INTEGER NOT NULL,
  "catchupLimit" SMALLINT NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "nextRunAt" TIMESTAMPTZ(6) NOT NULL,
  "lastTickAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformJobSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformJobSchedule_payload_version_check"
    CHECK ("payloadVersion" BETWEEN 1 AND 32),
  CONSTRAINT "PlatformJobSchedule_payload_object_check"
    CHECK (jsonb_typeof("payload") = 'object' AND octet_length("payload"::text) <= 4096),
  CONSTRAINT "PlatformJobSchedule_payload_hash_check"
    CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformJobSchedule_scope_check"
    CHECK (
      ("organizationId" IS NULL AND "scopeKey" = 'platform')
      OR
      ("organizationId" IS NOT NULL AND "scopeKey" = 'organization:' || "organizationId"::text)
    ),
  CONSTRAINT "PlatformJobSchedule_mapping_check"
    CHECK ("scheduleKey" = 'PLATFORM_HEALTH_PROBE' AND "jobType" = 'PLATFORM_HEALTH_PROBE'),
  CONSTRAINT "PlatformJobSchedule_cadence_check"
    CHECK ("cadenceSeconds" BETWEEN 60 AND 604800),
  CONSTRAINT "PlatformJobSchedule_catchup_check"
    CHECK ("catchupLimit" BETWEEN 1 AND 10),
  CONSTRAINT "PlatformJobSchedule_version_check" CHECK ("version" > 0)
);

CREATE TABLE "PlatformJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobType" "PlatformJobType" NOT NULL,
  "status" "PlatformJobStatus" NOT NULL DEFAULT 'AVAILABLE',
  "source" "PlatformJobSource" NOT NULL,
  "payloadVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" VARCHAR(64) NOT NULL,
  "scopeKey" VARCHAR(64) NOT NULL,
  "organizationId" UUID,
  "createdByAdminUserId" TEXT,
  "createdByPersonId" UUID,
  "scheduleId" UUID,
  "deduplicationKey" VARCHAR(160) NOT NULL,
  "priority" SMALLINT NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMPTZ(6) NOT NULL,
  "maxAttempts" SMALLINT NOT NULL DEFAULT 5,
  "attemptCount" SMALLINT NOT NULL DEFAULT 0,
  "leaseOwner" VARCHAR(96),
  "leaseToken" UUID,
  "fencingToken" BIGINT NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMPTZ(6),
  "heartbeatAt" TIMESTAMPTZ(6),
  "claimedAt" TIMESTAMPTZ(6),
  "startedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  "failedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "lastErrorCode" "PlatformJobErrorCode",
  "resultMetadata" JSONB,
  "resultHash" VARCHAR(64),
  "version" INTEGER NOT NULL DEFAULT 1,
  "requeueRootJobId" UUID,
  "requeueSequence" SMALLINT NOT NULL DEFAULT 0,
  "requeueCount" SMALLINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformJob_payload_version_check" CHECK ("payloadVersion" BETWEEN 1 AND 32),
  CONSTRAINT "PlatformJob_payload_object_check"
    CHECK (jsonb_typeof("payload") = 'object' AND octet_length("payload"::text) <= 4096),
  CONSTRAINT "PlatformJob_payload_hash_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformJob_scope_check"
    CHECK (
      ("organizationId" IS NULL AND "scopeKey" = 'platform')
      OR
      ("organizationId" IS NOT NULL AND "scopeKey" = 'organization:' || "organizationId"::text)
    ),
  CONSTRAINT "PlatformJob_actor_pair_check"
    CHECK (("createdByAdminUserId" IS NULL) = ("createdByPersonId" IS NULL)),
  CONSTRAINT "PlatformJob_source_check"
    CHECK (
      ("source" = 'ADMIN_MANUAL' AND "scheduleId" IS NULL AND "createdByAdminUserId" IS NOT NULL)
      OR
      ("source" = 'SCHEDULE' AND "scheduleId" IS NOT NULL AND "createdByAdminUserId" IS NOT NULL)
    ),
  CONSTRAINT "PlatformJob_deduplication_key_check"
    CHECK ("deduplicationKey" ~ '^[A-Za-z0-9][A-Za-z0-9._:~-]{0,159}$'),
  CONSTRAINT "PlatformJob_priority_check" CHECK ("priority" BETWEEN 0 AND 9),
  CONSTRAINT "PlatformJob_attempt_check"
    CHECK ("maxAttempts" BETWEEN 1 AND 10 AND "attemptCount" BETWEEN 0 AND "maxAttempts"),
  CONSTRAINT "PlatformJob_fencing_check" CHECK ("fencingToken" >= "attemptCount" AND "fencingToken" >= 0),
  CONSTRAINT "PlatformJob_version_check" CHECK ("version" > 0),
  CONSTRAINT "PlatformJob_requeue_check"
    CHECK (
      "requeueCount" BETWEEN 0 AND 3
      AND "requeueSequence" BETWEEN 0 AND 3
      AND (("requeueRootJobId" IS NULL AND "requeueSequence" = 0) OR ("requeueRootJobId" IS NOT NULL AND "requeueSequence" > 0))
    ),
  CONSTRAINT "PlatformJob_lease_check"
    CHECK (
      (
        "status" IN ('CLAIMED', 'RUNNING')
        AND "leaseOwner" IS NOT NULL
        AND "leaseToken" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "heartbeatAt" IS NOT NULL
        AND "claimedAt" IS NOT NULL
      )
      OR
      (
        "status" NOT IN ('CLAIMED', 'RUNNING')
        AND "leaseOwner" IS NULL
        AND "leaseToken" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "heartbeatAt" IS NULL
        AND "claimedAt" IS NULL
      )
    ),
  CONSTRAINT "PlatformJob_started_check"
    CHECK ("status" <> 'RUNNING' OR "startedAt" IS NOT NULL),
  CONSTRAINT "PlatformJob_completion_check"
    CHECK (
      ("status" = 'SUCCEEDED' AND "completedAt" IS NOT NULL AND "resultMetadata" IS NOT NULL AND "resultHash" IS NOT NULL)
      OR
      ("status" <> 'SUCCEEDED' AND "completedAt" IS NULL AND "resultMetadata" IS NULL AND "resultHash" IS NULL)
    ),
  CONSTRAINT "PlatformJob_failure_check"
    CHECK (
      ("status" IN ('FAILED', 'DEAD_LETTERED') AND "failedAt" IS NOT NULL AND "lastErrorCode" IS NOT NULL)
      OR
      ("status" NOT IN ('FAILED', 'DEAD_LETTERED') AND "failedAt" IS NULL)
    ),
  CONSTRAINT "PlatformJob_cancellation_check"
    CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)),
  CONSTRAINT "PlatformJob_result_size_check"
    CHECK ("resultMetadata" IS NULL OR octet_length("resultMetadata"::text) <= 2048),
  CONSTRAINT "PlatformJob_result_hash_check"
    CHECK ("resultHash" IS NULL OR "resultHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "PlatformJobAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobId" UUID NOT NULL,
  "attemptNumber" SMALLINT NOT NULL,
  "status" "PlatformJobAttemptStatus" NOT NULL DEFAULT 'CLAIMED',
  "workerId" VARCHAR(96) NOT NULL,
  "leaseToken" UUID NOT NULL,
  "fencingToken" BIGINT NOT NULL,
  "startedAt" TIMESTAMPTZ(6),
  "heartbeatAt" TIMESTAMPTZ(6),
  "finishedAt" TIMESTAMPTZ(6),
  "errorCode" "PlatformJobErrorCode",
  "resultMetadata" JSONB,
  "resultHash" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformJobAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformJobAttempt_number_check" CHECK ("attemptNumber" BETWEEN 1 AND 10),
  CONSTRAINT "PlatformJobAttempt_fencing_check" CHECK ("fencingToken" >= 1),
  CONSTRAINT "PlatformJobAttempt_active_check"
    CHECK (("status" IN ('CLAIMED', 'RUNNING')) = ("finishedAt" IS NULL)),
  CONSTRAINT "PlatformJobAttempt_started_check"
    CHECK (
      ("status" = 'CLAIMED' AND "startedAt" IS NULL)
      OR
      ("status" = 'RUNNING' AND "startedAt" IS NOT NULL)
      OR
      ("status" NOT IN ('CLAIMED', 'RUNNING'))
    ),
  CONSTRAINT "PlatformJobAttempt_error_check"
    CHECK (
      ("status" IN ('RETRY_SCHEDULED', 'FAILED', 'DEAD_LETTERED', 'LEASE_EXPIRED') AND "errorCode" IS NOT NULL)
      OR
      ("status" NOT IN ('RETRY_SCHEDULED', 'FAILED', 'DEAD_LETTERED', 'LEASE_EXPIRED') AND "errorCode" IS NULL)
    ),
  CONSTRAINT "PlatformJobAttempt_result_check"
    CHECK (
      ("status" = 'SUCCEEDED' AND "resultMetadata" IS NOT NULL AND "resultHash" IS NOT NULL)
      OR
      ("status" <> 'SUCCEEDED' AND "resultMetadata" IS NULL AND "resultHash" IS NULL)
    ),
  CONSTRAINT "PlatformJobAttempt_result_size_check"
    CHECK ("resultMetadata" IS NULL OR octet_length("resultMetadata"::text) <= 2048),
  CONSTRAINT "PlatformJobAttempt_result_hash_check"
    CHECK ("resultHash" IS NULL OR "resultHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "PlatformJobMutation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorAdminUserId" TEXT NOT NULL,
  "actorPersonId" UUID NOT NULL,
  "action" "PlatformJobMutationAction" NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "jobId" UUID,
  "scheduleId" UUID,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformJobMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformJobMutation_request_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformJobMutation_result_check"
    CHECK (jsonb_typeof("result") = 'object' AND octet_length("result"::text) <= 2048),
  CONSTRAINT "PlatformJobMutation_target_check"
    CHECK (
      ("action" IN ('MANUAL_TRIGGER', 'CANCEL', 'REQUEUE') AND "jobId" IS NOT NULL AND "scheduleId" IS NULL)
      OR
      ("action" IN ('SCHEDULE_ENABLE', 'SCHEDULE_DISABLE') AND "jobId" IS NULL AND "scheduleId" IS NOT NULL)
      OR
      ("action" IN ('WORKER_BATCH', 'SCHEDULER_TICK') AND "jobId" IS NULL AND "scheduleId" IS NULL)
    )
);

CREATE UNIQUE INDEX "PlatformJobSchedule_scheduleKey_scopeKey_key"
  ON "PlatformJobSchedule"("scheduleKey", "scopeKey");
CREATE INDEX "PlatformJobSchedule_enabled_nextRunAt_id_idx"
  ON "PlatformJobSchedule"("enabled", "nextRunAt", "id");
CREATE INDEX "PlatformJobSchedule_organizationId_enabled_nextRunAt_id_idx"
  ON "PlatformJobSchedule"("organizationId", "enabled", "nextRunAt", "id");
CREATE INDEX "PlatformJobSchedule_createdAt_id_idx"
  ON "PlatformJobSchedule"("createdAt", "id");

CREATE UNIQUE INDEX "PlatformJob_jobType_scopeKey_deduplicationKey_key"
  ON "PlatformJob"("jobType", "scopeKey", "deduplicationKey");
CREATE UNIQUE INDEX "PlatformJob_requeueRootJobId_requeueSequence_key"
  ON "PlatformJob"("requeueRootJobId", "requeueSequence");
CREATE INDEX "PlatformJob_status_priority_availableAt_id_idx"
  ON "PlatformJob"("status", "priority" DESC, "availableAt", "id");
CREATE INDEX "PlatformJob_status_leaseExpiresAt_id_idx"
  ON "PlatformJob"("status", "leaseExpiresAt", "id");
CREATE INDEX "PlatformJob_organizationId_status_createdAt_id_idx"
  ON "PlatformJob"("organizationId", "status", "createdAt", "id");
CREATE INDEX "PlatformJob_createdAt_id_idx" ON "PlatformJob"("createdAt", "id");
CREATE INDEX "PlatformJob_scheduleId_createdAt_id_idx" ON "PlatformJob"("scheduleId", "createdAt", "id");

CREATE UNIQUE INDEX "PlatformJobAttempt_jobId_attemptNumber_key"
  ON "PlatformJobAttempt"("jobId", "attemptNumber");
CREATE UNIQUE INDEX "PlatformJobAttempt_jobId_leaseToken_key"
  ON "PlatformJobAttempt"("jobId", "leaseToken");
CREATE INDEX "PlatformJobAttempt_jobId_createdAt_id_idx"
  ON "PlatformJobAttempt"("jobId", "createdAt", "id");
CREATE INDEX "PlatformJobAttempt_status_heartbeatAt_id_idx"
  ON "PlatformJobAttempt"("status", "heartbeatAt", "id");

CREATE UNIQUE INDEX "PlatformJobMutation_actorAdminUserId_idempotencyKey_key"
  ON "PlatformJobMutation"("actorAdminUserId", "idempotencyKey");
CREATE INDEX "PlatformJobMutation_jobId_action_createdAt_id_idx"
  ON "PlatformJobMutation"("jobId", "action", "createdAt", "id");
CREATE INDEX "PlatformJobMutation_scheduleId_action_createdAt_id_idx"
  ON "PlatformJobMutation"("scheduleId", "action", "createdAt", "id");
CREATE INDEX "PlatformJobMutation_actorAdminUserId_createdAt_id_idx"
  ON "PlatformJobMutation"("actorAdminUserId", "createdAt", "id");

ALTER TABLE "PlatformJobSchedule"
  ADD CONSTRAINT "PlatformJobSchedule_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJobSchedule_createdByAdminUserId_fkey"
  FOREIGN KEY ("createdByAdminUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJobSchedule_createdByPersonId_fkey"
  FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformJob"
  ADD CONSTRAINT "PlatformJob_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJob_createdByAdminUserId_fkey"
  FOREIGN KEY ("createdByAdminUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJob_createdByPersonId_fkey"
  FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJob_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "PlatformJobSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJob_requeueRootJobId_fkey"
  FOREIGN KEY ("requeueRootJobId") REFERENCES "PlatformJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformJobAttempt"
  ADD CONSTRAINT "PlatformJobAttempt_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "PlatformJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformJobMutation"
  ADD CONSTRAINT "PlatformJobMutation_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJobMutation_actorPersonId_fkey"
  FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJobMutation_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "PlatformJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformJobMutation_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "PlatformJobSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
