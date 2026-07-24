-- Gate 6C: bounded communications and payment automation.
-- This additive migration creates no jobs, schedules, provider events,
-- attempts, refunds, settlements, actors, tenants, or provider state.

ALTER TYPE "PlatformJobType" ADD VALUE 'COMMUNICATION_CAMPAIGN_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'COMMUNICATION_DELIVERY_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'COMMUNICATION_CAMPAIGN_DISPATCH';
ALTER TYPE "PlatformJobType" ADD VALUE 'COMMUNICATION_DELIVERY_DISPATCH';
ALTER TYPE "PlatformJobType" ADD VALUE 'PAYMENT_PROVIDER_EVENT_PROCESS';
ALTER TYPE "PlatformJobType" ADD VALUE 'PAYMENT_RETRY_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'PAYMENT_ATTEMPT_RETRY';
ALTER TYPE "PlatformJobType" ADD VALUE 'PAYMENT_REFUND_RETRY';
ALTER TYPE "PlatformJobType" ADD VALUE 'PAYMENT_RECONCILIATION';
ALTER TYPE "PlatformJobType" ADD VALUE 'SETTLEMENT_STATEMENT_GENERATE';

ALTER TYPE "PlatformJobSource" ADD VALUE 'PROVIDER_EVENT';

ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'COMMUNICATION_CAMPAIGN_DISCOVERY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'COMMUNICATION_DELIVERY_DISCOVERY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'PAYMENT_RETRY_DISCOVERY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'PAYMENT_RECONCILIATION';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'SETTLEMENT_STATEMENT_GENERATE';

ALTER TABLE "OutboundDelivery"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PaymentAttempt"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "retryable" BOOLEAN,
  ADD COLUMN "nextRetryAt" TIMESTAMPTZ(6),
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PaymentProviderEvent"
  ADD COLUMN "normalizedAmount" DECIMAL(18,3),
  ADD COLUMN "normalizedCurrency" VARCHAR(3),
  ADD COLUMN "processingVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PaymentRefund"
  ADD COLUMN "providerRequestReference" VARCHAR(180),
  ADD COLUMN "retryable" BOOLEAN,
  ADD COLUMN "nextRetryAt" TIMESTAMPTZ(6),
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PlatformJob"
  ADD COLUMN "providerEventId" UUID;

DO $$
DECLARE
  delivery_invalid_claim_count BIGINT;
  event_invalid_normalized_money_count BIGINT;
  attempt_invalid_retry_count BIGINT;
  refund_invalid_retry_count BIGINT;
  duplicate_draft_settlement_count BIGINT;
  invalid_provider_job_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO delivery_invalid_claim_count
  FROM "OutboundDelivery"
  WHERE NOT (
    (
      "status" = 'CLAIMED'
      AND "claimedAt" IS NOT NULL
      AND "claimOwner" IS NOT NULL
      AND "claimExpiresAt" IS NOT NULL
    )
    OR
    (
      "status" <> 'CLAIMED'
      AND "claimedAt" IS NULL
      AND "claimOwner" IS NULL
      AND "claimExpiresAt" IS NULL
    )
  );

  SELECT COUNT(*) INTO event_invalid_normalized_money_count
  FROM "PaymentProviderEvent"
  WHERE NOT (
    (
      "normalizedAmount" IS NULL
      AND "normalizedCurrency" IS NULL
    )
    OR
    (
      "normalizedAmount" IS NOT NULL
      AND "normalizedAmount" > 0
      AND "normalizedAmount" = trunc("normalizedAmount")
      AND "normalizedAmount" <= 999999999999999.000
      AND "normalizedCurrency" IS NOT NULL
      AND "normalizedCurrency" = 'IQD'
    )
  );

  SELECT COUNT(*) INTO attempt_invalid_retry_count
  FROM "PaymentAttempt"
  WHERE NOT (
    (
      "status" = 'FAILED'
      AND "retryable" IS TRUE
      AND "nextRetryAt" IS NOT NULL
    )
    OR
    (
      "status" = 'FAILED'
      AND "retryable" IS DISTINCT FROM TRUE
      AND "nextRetryAt" IS NULL
    )
    OR
    (
      "status" <> 'FAILED'
      AND "retryable" IS NULL
      AND "nextRetryAt" IS NULL
    )
  );

  SELECT COUNT(*) INTO refund_invalid_retry_count
  FROM "PaymentRefund"
  WHERE NOT (
    (
      "status" = 'FAILED'
      AND "retryable" IS TRUE
      AND "nextRetryAt" IS NOT NULL
    )
    OR
    (
      "status" = 'FAILED'
      AND "retryable" IS DISTINCT FROM TRUE
      AND "nextRetryAt" IS NULL
    )
    OR
    (
      "status" <> 'FAILED'
      AND "retryable" IS NULL
      AND "nextRetryAt" IS NULL
    )
  );

  SELECT COUNT(*) INTO duplicate_draft_settlement_count
  FROM (
    SELECT "organizationId", "currency", "periodStart", "periodEnd"
    FROM "SettlementBatch"
    WHERE "status" = 'DRAFT'
    GROUP BY "organizationId", "currency", "periodStart", "periodEnd"
    HAVING COUNT(*) > 1
  ) AS duplicate_draft;

  SELECT COUNT(*) INTO invalid_provider_job_count
  FROM "PlatformJob"
  WHERE "providerEventId" IS NOT NULL;

  IF delivery_invalid_claim_count <> 0
    OR event_invalid_normalized_money_count <> 0
    OR attempt_invalid_retry_count <> 0
    OR refund_invalid_retry_count <> 0
    OR duplicate_draft_settlement_count <> 0
    OR invalid_provider_job_count <> 0 THEN
    RAISE EXCEPTION
      'Gate 6C preflight failed: delivery_invalid_claim=%, event_invalid_normalized_money=%, attempt_invalid_retry=%, refund_invalid_retry=%, duplicate_draft_settlement=%, invalid_provider_job=%',
      delivery_invalid_claim_count,
      event_invalid_normalized_money_count,
      attempt_invalid_retry_count,
      refund_invalid_retry_count,
      duplicate_draft_settlement_count,
      invalid_provider_job_count;
  END IF;
END;
$$;

ALTER TABLE "OutboundDelivery"
  ADD CONSTRAINT "OutboundDelivery_version_check"
  CHECK ("version" > 0);

ALTER TABLE "OutboundDelivery"
  DROP CONSTRAINT "OutboundDelivery_claim_check";
ALTER TABLE "OutboundDelivery"
  ADD CONSTRAINT "OutboundDelivery_claim_check"
  CHECK (
    (
      "status" = 'CLAIMED'
      AND "claimedAt" IS NOT NULL
      AND "claimOwner" IS NOT NULL
      AND "claimExpiresAt" IS NOT NULL
    )
    OR
    (
      "status" <> 'CLAIMED'
      AND "claimedAt" IS NULL
      AND "claimOwner" IS NULL
      AND "claimExpiresAt" IS NULL
    )
  );

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_version_check"
  CHECK ("version" > 0);
ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_retry_count_check"
  CHECK ("retryCount" BETWEEN 0 AND 5);
ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_retry_check"
  CHECK (
    (
      "status" = 'FAILED'
      AND "retryable" IS TRUE
      AND "nextRetryAt" IS NOT NULL
    )
    OR
    (
      "status" = 'FAILED'
      AND "retryable" IS DISTINCT FROM TRUE
      AND "nextRetryAt" IS NULL
    )
    OR
    (
      "status" <> 'FAILED'
      AND "retryable" IS NULL
      AND "nextRetryAt" IS NULL
    )
  );

ALTER TABLE "PaymentProviderEvent"
  ADD CONSTRAINT "PaymentProviderEvent_processing_version_check"
  CHECK ("processingVersion" > 0);
ALTER TABLE "PaymentProviderEvent"
  ADD CONSTRAINT "PaymentProviderEvent_normalized_money_check"
  CHECK (
    (
      "normalizedAmount" IS NULL
      AND "normalizedCurrency" IS NULL
    )
    OR
    (
      "normalizedAmount" IS NOT NULL
      AND "normalizedAmount" > 0
      AND "normalizedAmount" = trunc("normalizedAmount")
      AND "normalizedAmount" <= 999999999999999.000
      AND "normalizedCurrency" IS NOT NULL
      AND "normalizedCurrency" = 'IQD'
    )
  );

ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_provider_request_reference_check"
  CHECK (
    "providerRequestReference" IS NULL
    OR "providerRequestReference" ~ '^refund_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );
ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_retry_count_check"
  CHECK ("retryCount" BETWEEN 0 AND 5);
ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_retry_check"
  CHECK (
    (
      "status" = 'FAILED'
      AND "retryable" IS TRUE
      AND "nextRetryAt" IS NOT NULL
    )
    OR
    (
      "status" = 'FAILED'
      AND "retryable" IS DISTINCT FROM TRUE
      AND "nextRetryAt" IS NULL
    )
    OR
    (
      "status" <> 'FAILED'
      AND "retryable" IS NULL
      AND "nextRetryAt" IS NULL
    )
  );

ALTER TABLE "PlatformJob"
  DROP CONSTRAINT "PlatformJob_source_check";
ALTER TABLE "PlatformJob"
  ADD CONSTRAINT "PlatformJob_source_check"
  CHECK (
    (
      "source"::text = 'ADMIN_MANUAL'
      AND "scheduleId" IS NULL
      AND "parentJobId" IS NULL
      AND "providerEventId" IS NULL
      AND "createdByAdminUserId" IS NOT NULL
      AND "createdByPersonId" IS NOT NULL
    )
    OR
    (
      "source"::text = 'SCHEDULE'
      AND "scheduleId" IS NOT NULL
      AND "parentJobId" IS NULL
      AND "providerEventId" IS NULL
      AND "createdByAdminUserId" IS NOT NULL
      AND "createdByPersonId" IS NOT NULL
    )
    OR
    (
      "source"::text = 'DOMAIN_DISCOVERY'
      AND "scheduleId" IS NULL
      AND "parentJobId" IS NOT NULL
      AND "providerEventId" IS NULL
      AND "createdByAdminUserId" IS NOT NULL
      AND "createdByPersonId" IS NOT NULL
    )
    OR
    (
      "source"::text = 'PROVIDER_EVENT'
      AND "jobType"::text = 'PAYMENT_PROVIDER_EVENT_PROCESS'
      AND "scheduleId" IS NULL
      AND "parentJobId" IS NULL
      AND "providerEventId" IS NOT NULL
      AND "createdByAdminUserId" IS NULL
      AND "createdByPersonId" IS NULL
    )
  );

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
  );

CREATE UNIQUE INDEX "PlatformJob_providerEventId_key"
  ON "PlatformJob"("providerEventId");
CREATE INDEX "OutboundDelivery_status_nextAttemptAt_version_id_idx"
  ON "OutboundDelivery"("status", "nextAttemptAt", "version", "id");
CREATE INDEX "PaymentAttempt_status_retryable_nextRetryAt_id_idx"
  ON "PaymentAttempt"("status", "retryable", "nextRetryAt", "id");
CREATE INDEX "PaymentRefund_status_retryable_nextRetryAt_id_idx"
  ON "PaymentRefund"("status", "retryable", "nextRetryAt", "id");
CREATE INDEX "SettlementBatch_status_periodEnd_organizationId_id_idx"
  ON "SettlementBatch"("status", "periodEnd", "organizationId", "id");
CREATE UNIQUE INDEX "SettlementBatch_one_draft_period_key"
  ON "SettlementBatch"("organizationId", "currency", "periodStart", "periodEnd")
  WHERE "status" = 'DRAFT';

ALTER TABLE "PlatformJob"
  ADD CONSTRAINT "PlatformJob_providerEventId_fkey"
  FOREIGN KEY ("providerEventId") REFERENCES "PaymentProviderEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
