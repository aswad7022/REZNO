ALTER TABLE "PlatformJobMutation"
  ADD COLUMN "operationBatchSize" SMALLINT,
  ADD COLUMN "operationWorkerId" VARCHAR(96),
  ADD COLUMN "operationLeaseToken" UUID,
  ADD COLUMN "operationFencingToken" BIGINT,
  ADD COLUMN "operationLeaseExpiresAt" TIMESTAMPTZ(6),
  ADD COLUMN "operationCompletedAt" TIMESTAMPTZ(6);

UPDATE "PlatformJobMutation" AS mutation
SET "operationBatchSize" = CASE
      WHEN mutation."result"->>'state' = 'COMPLETE'
        THEN LEAST(10, GREATEST(1, COALESCE((mutation."result"->>'claimed')::integer, 1)))
      ELSE LEAST(10, GREATEST(1, COALESCE(attempts."attemptCount", 1)))
    END,
    "operationWorkerId" = 'admin:'
      || substr(encode(sha256(convert_to(to_json(mutation."actorAdminUserId")::text, 'UTF8')), 'hex'), 1, 16)
      || ':' || mutation."idempotencyKey"::text,
    "operationLeaseToken" = CASE
      WHEN mutation."result"->>'state' = 'PROCESSING' THEN gen_random_uuid()
      ELSE NULL
    END,
    "operationFencingToken" = 1,
    "operationLeaseExpiresAt" = CASE
      WHEN mutation."result"->>'state' = 'PROCESSING' THEN mutation."createdAt"
      ELSE NULL
    END,
    "operationCompletedAt" = CASE
      WHEN mutation."result"->>'state' = 'COMPLETE' THEN mutation."createdAt"
      ELSE NULL
    END
FROM (
  SELECT "workerId", COUNT(DISTINCT "jobId")::integer AS "attemptCount"
  FROM "PlatformJobAttempt"
  GROUP BY "workerId"
) AS attempts
WHERE mutation."action" = 'WORKER_BATCH'
  AND attempts."workerId" = 'admin:'
    || substr(encode(sha256(convert_to(to_json(mutation."actorAdminUserId")::text, 'UTF8')), 'hex'), 1, 16)
    || ':' || mutation."idempotencyKey"::text;

UPDATE "PlatformJobMutation" AS mutation
SET "operationBatchSize" = CASE
      WHEN mutation."result"->>'state' = 'COMPLETE'
        THEN LEAST(10, GREATEST(1, COALESCE((mutation."result"->>'claimed')::integer, 1)))
      ELSE 1
    END,
    "operationWorkerId" = 'admin:'
      || substr(encode(sha256(convert_to(to_json(mutation."actorAdminUserId")::text, 'UTF8')), 'hex'), 1, 16)
      || ':' || mutation."idempotencyKey"::text,
    "operationLeaseToken" = CASE
      WHEN mutation."result"->>'state' = 'PROCESSING' THEN gen_random_uuid()
      ELSE NULL
    END,
    "operationFencingToken" = 1,
    "operationLeaseExpiresAt" = CASE
      WHEN mutation."result"->>'state' = 'PROCESSING' THEN mutation."createdAt"
      ELSE NULL
    END,
    "operationCompletedAt" = CASE
      WHEN mutation."result"->>'state' = 'COMPLETE' THEN mutation."createdAt"
      ELSE NULL
    END
WHERE mutation."action" = 'WORKER_BATCH'
  AND mutation."operationBatchSize" IS NULL;

ALTER TABLE "PlatformJobMutation"
  ADD CONSTRAINT "PlatformJobMutation_operation_check"
  CHECK (
    (
      "action" = 'WORKER_BATCH'
      AND "operationBatchSize" BETWEEN 1 AND 10
      AND "operationWorkerId" ~ '^operation:[a-f0-9]{64}$|^admin:[a-f0-9]{16}:[0-9a-f-]{36}$'
      AND "operationFencingToken" >= 1
      AND (
        (
          "operationCompletedAt" IS NULL
          AND "operationLeaseToken" IS NOT NULL
          AND "operationLeaseExpiresAt" IS NOT NULL
          AND "result"->>'state' = 'PROCESSING'
        )
        OR
        (
          "operationCompletedAt" IS NOT NULL
          AND "operationLeaseToken" IS NULL
          AND "operationLeaseExpiresAt" IS NULL
          AND "result"->>'state' = 'COMPLETE'
        )
      )
    )
    OR
    (
      "action" <> 'WORKER_BATCH'
      AND "operationBatchSize" IS NULL
      AND "operationWorkerId" IS NULL
      AND "operationLeaseToken" IS NULL
      AND "operationFencingToken" IS NULL
      AND "operationLeaseExpiresAt" IS NULL
      AND "operationCompletedAt" IS NULL
    )
  );

CREATE INDEX "PlatformJobMutation_action_operationLeaseExpiresAt_id_idx"
  ON "PlatformJobMutation"("action", "operationLeaseExpiresAt", "id");

CREATE INDEX "PlatformJobAttempt_workerId_createdAt_id_idx"
  ON "PlatformJobAttempt"("workerId", "createdAt", "id");
