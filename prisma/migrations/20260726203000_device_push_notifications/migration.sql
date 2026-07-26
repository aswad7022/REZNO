CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "PushProvider" AS ENUM ('APNS', 'FCM');
CREATE TYPE "PushPermissionStatus" AS ENUM ('GRANTED', 'PROVISIONAL');
CREATE TYPE "PushInstallationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'INVALIDATED');
CREATE TYPE "PushInstallationMutationAction" AS ENUM ('REGISTER', 'REVOKE');
CREATE TYPE "PushDeliveryTargetStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'ACCEPTED',
  'DELIVERED',
  'RETRY_SCHEDULED',
  'PERMANENT_FAILURE',
  'INVALID_TOKEN',
  'UNKNOWN'
);
CREATE TYPE "PushReceiptStatus" AS ENUM (
  'DELIVERED',
  'TRANSIENT_FAILURE',
  'PERMANENT_FAILURE',
  'INVALID_TOKEN'
);

CREATE TABLE "PushInstallation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "installationId" UUID NOT NULL,
  "personId" UUID NOT NULL,
  "platform" "PushPlatform" NOT NULL,
  "provider" "PushProvider" NOT NULL,
  "status" "PushInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
  "permissionStatus" "PushPermissionStatus" NOT NULL,
  "installationSecretHash" VARCHAR(64) NOT NULL,
  "tokenCiphertext" TEXT NOT NULL,
  "tokenFingerprint" VARCHAR(64) NOT NULL,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "appVersion" VARCHAR(50) NOT NULL,
  "lastRegisteredAt" TIMESTAMPTZ(6) NOT NULL,
  "revokedAt" TIMESTAMPTZ(6),
  "invalidatedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PushInstallation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushInstallation_platform_provider_check"
    CHECK (("platform" = 'IOS' AND "provider" = 'APNS') OR ("platform" = 'ANDROID' AND "provider" = 'FCM')),
  CONSTRAINT "PushInstallation_secret_hash_check"
    CHECK ("installationSecretHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PushInstallation_token_fingerprint_check"
    CHECK ("tokenFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PushInstallation_token_ciphertext_check"
    CHECK (octet_length("tokenCiphertext") BETWEEN 40 AND 8192),
  CONSTRAINT "PushInstallation_token_version_check"
    CHECK ("tokenVersion" >= 1),
  CONSTRAINT "PushInstallation_app_version_check"
    CHECK ("appVersion" ~ '^[0-9A-Za-z][0-9A-Za-z._+-]{0,49}$'),
  CONSTRAINT "PushInstallation_terminal_timestamp_check"
    CHECK (
      ("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "invalidatedAt" IS NULL)
      OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "invalidatedAt" IS NULL)
      OR ("status" = 'INVALIDATED' AND "invalidatedAt" IS NOT NULL AND "revokedAt" IS NULL)
    )
);

CREATE TABLE "PushInstallationMutation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "personId" UUID NOT NULL,
  "installationId" UUID NOT NULL,
  "installationSecretHash" VARCHAR(64) NOT NULL,
  "operationGeneration" INTEGER NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "action" "PushInstallationMutationAction" NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushInstallationMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushInstallationMutation_secret_hash_check"
    CHECK ("installationSecretHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PushInstallationMutation_operation_generation_check"
    CHECK ("operationGeneration" >= 1),
  CONSTRAINT "PushInstallationMutation_request_hash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "PushDeliveryTarget" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "outboundDeliveryId" UUID NOT NULL,
  "installationId" UUID NOT NULL,
  "installationTokenVersion" INTEGER NOT NULL,
  "status" "PushDeliveryTargetStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "claimGeneration" INTEGER NOT NULL DEFAULT 0,
  "providerName" VARCHAR(80),
  "providerMessageId" VARCHAR(191),
  "lastSafeCode" VARCHAR(80),
  "acceptedAt" TIMESTAMPTZ(6),
  "deliveredAt" TIMESTAMPTZ(6),
  "failedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PushDeliveryTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDeliveryTarget_attempt_count_check"
    CHECK ("attemptCount" BETWEEN 0 AND 3),
  CONSTRAINT "PushDeliveryTarget_claim_generation_check"
    CHECK ("claimGeneration" >= 0),
  CONSTRAINT "PushDeliveryTarget_token_version_check"
    CHECK ("installationTokenVersion" >= 1),
  CONSTRAINT "PushDeliveryTarget_provider_message_check"
    CHECK (
      ("providerName" IS NULL AND "providerMessageId" IS NULL)
      OR ("providerName" IS NOT NULL AND "providerMessageId" IS NOT NULL)
    )
);

CREATE TABLE "PushProviderReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "targetId" UUID,
  "provider" "PushProvider" NOT NULL,
  "providerEventId" VARCHAR(191) NOT NULL,
  "status" "PushReceiptStatus" NOT NULL,
  "safeCode" VARCHAR(80) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "providerOccurredAt" TIMESTAMPTZ(6) NOT NULL,
  "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushProviderReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushProviderReceipt_event_id_check"
    CHECK ("providerEventId" ~ '^[A-Za-z0-9][A-Za-z0-9._:~-]{0,190}$'),
  CONSTRAINT "PushProviderReceipt_safe_code_check"
    CHECK ("safeCode" ~ '^[A-Z0-9][A-Z0-9_.:-]{0,79}$'),
  CONSTRAINT "PushProviderReceipt_request_hash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "PushInstallation_installationId_key"
  ON "PushInstallation"("installationId");
CREATE UNIQUE INDEX "PushInstallation_active_tokenFingerprint_key"
  ON "PushInstallation"("tokenFingerprint")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "PushInstallation_personId_status_updatedAt_id_idx"
  ON "PushInstallation"("personId", "status", "updatedAt", "id");
CREATE INDEX "PushInstallation_status_provider_updatedAt_id_idx"
  ON "PushInstallation"("status", "provider", "updatedAt", "id");
CREATE INDEX "PushInstallation_tokenFingerprint_idx"
  ON "PushInstallation"("tokenFingerprint");

CREATE UNIQUE INDEX "PushInstallationMutation_personId_idempotencyKey_key"
  ON "PushInstallationMutation"("personId", "idempotencyKey");
CREATE INDEX "PushInstallationMutation_installationId_createdAt_id_idx"
  ON "PushInstallationMutation"("installationId", "createdAt", "id");
CREATE INDEX "PushInstallationMutation_installationId_installationSecretHash_operationGeneration_idx"
  ON "PushInstallationMutation"(
    "installationId",
    "installationSecretHash",
    "operationGeneration"
  );

CREATE UNIQUE INDEX "PushDeliveryTarget_outboundDeliveryId_installationId_key"
  ON "PushDeliveryTarget"("outboundDeliveryId", "installationId");
CREATE INDEX "PushDeliveryTarget_providerName_providerMessageId_idx"
  ON "PushDeliveryTarget"("providerName", "providerMessageId");
CREATE INDEX "PushDeliveryTarget_status_updatedAt_id_idx"
  ON "PushDeliveryTarget"("status", "updatedAt", "id");

CREATE UNIQUE INDEX "PushProviderReceipt_provider_providerEventId_key"
  ON "PushProviderReceipt"("provider", "providerEventId");
CREATE INDEX "PushProviderReceipt_targetId_receivedAt_id_idx"
  ON "PushProviderReceipt"("targetId", "receivedAt", "id");

ALTER TABLE "PushInstallation"
  ADD CONSTRAINT "PushInstallation_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushInstallationMutation"
  ADD CONSTRAINT "PushInstallationMutation_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDeliveryTarget"
  ADD CONSTRAINT "PushDeliveryTarget_outboundDeliveryId_fkey"
  FOREIGN KEY ("outboundDeliveryId") REFERENCES "OutboundDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushDeliveryTarget"
  ADD CONSTRAINT "PushDeliveryTarget_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "PushInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushProviderReceipt"
  ADD CONSTRAINT "PushProviderReceipt_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "PushDeliveryTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
