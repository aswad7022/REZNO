-- Gate 4C: canonical Admin campaigns and provider-neutral outbound delivery.
-- Historical notifications and migrations 1-37 are intentionally untouched.

CREATE TYPE "CommunicationCampaignStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'QUEUED',
  'DISPATCHING',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "CommunicationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

CREATE TYPE "OutboundDeliveryStatus" AS ENUM (
  'PENDING',
  'CLAIMED',
  'ACCEPTED',
  'RETRY_SCHEDULED',
  'PERMANENT_FAILURE',
  'SUPPRESSED',
  'CANCELLED'
);

CREATE TYPE "OutboundAttemptOutcome" AS ENUM (
  'ACCEPTED',
  'TRANSIENT_FAILURE',
  'PERMANENT_FAILURE',
  'NOT_CONFIGURED'
);

ALTER TABLE "Person"
  ADD COLUMN "phoneVerifiedAt" TIMESTAMPTZ(6);

ALTER TABLE "Notification"
  ADD COLUMN "localizedContent" JSONB;

CREATE TABLE "CommunicationCampaign" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByAdminUserId" TEXT NOT NULL,
  "updatedByAdminUserId" TEXT NOT NULL,
  "status" "CommunicationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "audience" "NotificationAudience" NOT NULL,
  "targetPersonId" UUID,
  "targetOrganizationId" UUID,
  "channels" "CommunicationChannel"[] NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "destinationKind" "NotificationDestinationKind" NOT NULL DEFAULT 'NOTIFICATIONS',
  "destinationTargetId" UUID,
  "localizedContent" JSONB NOT NULL,
  "scheduledAt" TIMESTAMPTZ(6),
  "recipientEvaluationAt" TIMESTAMPTZ(6),
  "dispatchStartedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "cancellationReason" VARCHAR(500),
  "inAppNotificationId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "CommunicationCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationCampaign_version_check" CHECK ("version" > 0),
  CONSTRAINT "CommunicationCampaign_channels_check" CHECK (cardinality("channels") BETWEEN 1 AND 4),
  CONSTRAINT "CommunicationCampaign_target_check" CHECK (
    ("audience" = 'USER' AND "targetPersonId" IS NOT NULL AND "targetOrganizationId" IS NULL)
    OR ("audience" = 'BUSINESS' AND "targetPersonId" IS NULL AND "targetOrganizationId" IS NOT NULL)
    OR ("audience" NOT IN ('USER', 'BUSINESS') AND "targetPersonId" IS NULL AND "targetOrganizationId" IS NULL)
  ),
  CONSTRAINT "CommunicationCampaign_mandatory_check" CHECK (NOT "mandatory" OR "category" = 'ACCOUNT'),
  CONSTRAINT "CommunicationCampaign_destination_target_check" CHECK ("destinationTargetId" IS NULL),
  CONSTRAINT "CommunicationCampaign_cancellation_check" CHECK (
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
    OR ("status" <> 'CANCELLED')
  )
);

CREATE TABLE "CommunicationCampaignMutation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaignId" UUID NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "resultVersion" INTEGER NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunicationCampaignMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationCampaignMutation_versions_check" CHECK (
    "expectedVersion" >= 0 AND "resultVersion" > 0
  )
);

CREATE TABLE "OutboundPreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "personId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "emailCategories" "NotificationCategory"[] NOT NULL DEFAULT ARRAY[]::"NotificationCategory"[],
  "smsCategories" "NotificationCategory"[] NOT NULL DEFAULT ARRAY[]::"NotificationCategory"[],
  "pushCategories" "NotificationCategory"[] NOT NULL DEFAULT ARRAY[]::"NotificationCategory"[],
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "OutboundPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboundPreference_version_check" CHECK ("version" > 0)
);

CREATE TABLE "OutboundPreferenceMutation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "personId" UUID NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "resultVersion" INTEGER NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundPreferenceMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboundPreferenceMutation_versions_check" CHECK (
    "expectedVersion" > 0 AND "resultVersion" > 0
  )
);

CREATE TABLE "OutboundDelivery" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaignId" UUID NOT NULL,
  "personId" UUID NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "locale" VARCHAR(3) NOT NULL,
  "endpointType" VARCHAR(20) NOT NULL,
  "endpointFingerprint" VARCHAR(64),
  "status" "OutboundDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(6),
  "claimedAt" TIMESTAMPTZ(6),
  "claimOwner" VARCHAR(100),
  "claimExpiresAt" TIMESTAMPTZ(6),
  "acceptedAt" TIMESTAMPTZ(6),
  "failedAt" TIMESTAMPTZ(6),
  "suppressionReason" VARCHAR(80),
  "providerName" VARCHAR(80),
  "providerMessageId" VARCHAR(191),
  "lastProviderCode" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "OutboundDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboundDelivery_channel_check" CHECK ("channel" <> 'IN_APP'),
  CONSTRAINT "OutboundDelivery_locale_check" CHECK ("locale" IN ('AR', 'EN', 'CKB')),
  CONSTRAINT "OutboundDelivery_attempt_count_check" CHECK ("attemptCount" BETWEEN 0 AND 5),
  CONSTRAINT "OutboundDelivery_claim_check" CHECK (
    ("status" = 'CLAIMED' AND "claimedAt" IS NOT NULL AND "claimOwner" IS NOT NULL AND "claimExpiresAt" IS NOT NULL)
    OR ("status" <> 'CLAIMED')
  )
);

CREATE TABLE "OutboundDeliveryAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deliveryId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "claimOwner" VARCHAR(100) NOT NULL,
  "startedAt" TIMESTAMPTZ(6) NOT NULL,
  "finishedAt" TIMESTAMPTZ(6),
  "outcome" "OutboundAttemptOutcome",
  "providerName" VARCHAR(80),
  "providerMessageId" VARCHAR(191),
  "safeProviderCode" VARCHAR(80),
  "retryable" BOOLEAN,
  "nextAttemptAt" TIMESTAMPTZ(6),
  "sanitizedMetadata" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboundDeliveryAttempt_number_check" CHECK ("attemptNumber" BETWEEN 1 AND 5),
  CONSTRAINT "OutboundDeliveryAttempt_completion_check" CHECK (
    ("finishedAt" IS NULL AND "outcome" IS NULL)
    OR ("finishedAt" IS NOT NULL AND "outcome" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "CommunicationCampaign_inAppNotificationId_key"
  ON "CommunicationCampaign"("inAppNotificationId");
CREATE INDEX "CommunicationCampaign_createdAt_id_idx"
  ON "CommunicationCampaign"("createdAt", "id");
CREATE INDEX "CommunicationCampaign_status_createdAt_id_idx"
  ON "CommunicationCampaign"("status", "createdAt", "id");
CREATE INDEX "CommunicationCampaign_status_scheduledAt_id_idx"
  ON "CommunicationCampaign"("status", "scheduledAt", "id");
CREATE INDEX "CommunicationCampaign_targetPersonId_idx"
  ON "CommunicationCampaign"("targetPersonId");
CREATE INDEX "CommunicationCampaign_targetOrganizationId_idx"
  ON "CommunicationCampaign"("targetOrganizationId");

CREATE UNIQUE INDEX "CommunicationCampaignMutation_adminUserId_idempotencyKey_key"
  ON "CommunicationCampaignMutation"("adminUserId", "idempotencyKey");
CREATE INDEX "CommunicationCampaignMutation_campaignId_action_createdAt_i_idx"
  ON "CommunicationCampaignMutation"("campaignId", "action", "createdAt", "id");
CREATE INDEX "CommunicationCampaignMutation_adminUserId_action_createdAt__idx"
  ON "CommunicationCampaignMutation"("adminUserId", "action", "createdAt", "id");

CREATE UNIQUE INDEX "OutboundPreference_personId_key"
  ON "OutboundPreference"("personId");
CREATE UNIQUE INDEX "OutboundPreferenceMutation_personId_idempotencyKey_key"
  ON "OutboundPreferenceMutation"("personId", "idempotencyKey");
CREATE INDEX "OutboundPreferenceMutation_personId_createdAt_id_idx"
  ON "OutboundPreferenceMutation"("personId", "createdAt", "id");

CREATE UNIQUE INDEX "OutboundDelivery_campaignId_personId_channel_key"
  ON "OutboundDelivery"("campaignId", "personId", "channel");
CREATE INDEX "OutboundDelivery_status_nextAttemptAt_id_idx"
  ON "OutboundDelivery"("status", "nextAttemptAt", "id");
CREATE INDEX "OutboundDelivery_status_claimExpiresAt_id_idx"
  ON "OutboundDelivery"("status", "claimExpiresAt", "id");
CREATE INDEX "OutboundDelivery_campaignId_createdAt_id_idx"
  ON "OutboundDelivery"("campaignId", "createdAt", "id");
CREATE INDEX "OutboundDelivery_campaignId_status_createdAt_id_idx"
  ON "OutboundDelivery"("campaignId", "status", "createdAt", "id");
CREATE INDEX "OutboundDelivery_personId_createdAt_id_idx"
  ON "OutboundDelivery"("personId", "createdAt", "id");

CREATE UNIQUE INDEX "OutboundDeliveryAttempt_deliveryId_attemptNumber_key"
  ON "OutboundDeliveryAttempt"("deliveryId", "attemptNumber");
CREATE INDEX "OutboundDeliveryAttempt_deliveryId_createdAt_id_idx"
  ON "OutboundDeliveryAttempt"("deliveryId", "createdAt", "id");

ALTER TABLE "CommunicationCampaign"
  ADD CONSTRAINT "CommunicationCampaign_createdByAdminUserId_fkey"
  FOREIGN KEY ("createdByAdminUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunicationCampaign_updatedByAdminUserId_fkey"
  FOREIGN KEY ("updatedByAdminUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunicationCampaign_targetPersonId_fkey"
  FOREIGN KEY ("targetPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunicationCampaign_targetOrganizationId_fkey"
  FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunicationCampaign_inAppNotificationId_fkey"
  FOREIGN KEY ("inAppNotificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunicationCampaignMutation"
  ADD CONSTRAINT "CommunicationCampaignMutation_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunicationCampaignMutation_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboundPreference"
  ADD CONSTRAINT "OutboundPreference_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundPreferenceMutation"
  ADD CONSTRAINT "OutboundPreferenceMutation_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundDelivery"
  ADD CONSTRAINT "OutboundDelivery_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OutboundDelivery_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboundDeliveryAttempt"
  ADD CONSTRAINT "OutboundDeliveryAttempt_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "OutboundDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing send grants retain access to the newly separated view capability.
-- Manual dispatch is deliberately never granted implicitly.
UPDATE "AdminAccess"
SET "permissions" = array_append("permissions", 'NOTIFICATIONS_VIEW'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE 'NOTIFICATIONS_SEND' = ANY("permissions")
  AND NOT ('NOTIFICATIONS_VIEW' = ANY("permissions"));
