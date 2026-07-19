-- Gate 5A: provider-neutral managed storage and secure upload foundation.
-- Legacy URL fields and migrations 1-38 are intentionally untouched.

CREATE TYPE "StoragePurpose" AS ENUM (
  'CUSTOMER_AVATAR',
  'BUSINESS_LOGO',
  'BUSINESS_COVER',
  'BUSINESS_GALLERY_IMAGE',
  'SERVICE_IMAGE',
  'STORE_LOGO',
  'STORE_COVER',
  'PRODUCT_IMAGE',
  'RESTAURANT_MENU_IMAGE',
  'INTERNAL_STORAGE_TEST'
);

CREATE TYPE "StorageVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'INTERNAL');
CREATE TYPE "StorageProviderKind" AS ENUM ('NOT_CONFIGURED', 'DETERMINISTIC_TEST');
CREATE TYPE "UploadSessionState" AS ENUM (
  'CREATED', 'TARGET_ISSUED', 'UPLOADED', 'FINALIZED', 'ABORTED', 'EXPIRED', 'FAILED'
);
CREATE TYPE "StoredAssetState" AS ENUM (
  'PENDING_UPLOAD', 'UPLOADED', 'PENDING_INSPECTION', 'READY',
  'QUARANTINED', 'REJECTED', 'DELETE_PENDING', 'DELETED'
);
CREATE TYPE "StorageInspectionOutcome" AS ENUM (
  'VALID', 'INVALID_TYPE', 'INVALID_STRUCTURE', 'ANIMATED_NOT_ALLOWED',
  'DIMENSION_LIMIT_EXCEEDED', 'DECOMPRESSION_LIMIT_EXCEEDED', 'INSPECTION_FAILED'
);
CREATE TYPE "StorageScannerOutcome" AS ENUM (
  'SCANNER_NOT_CONFIGURED', 'CLEAN', 'MALWARE_DETECTED', 'SCAN_FAILED'
);
CREATE TYPE "StorageMutationAction" AS ENUM (
  'CREATE_SESSION', 'ISSUE_UPLOAD_TARGET', 'FINALIZE_UPLOAD', 'ABORT_UPLOAD',
  'DELETE_ASSET', 'ADMIN_REJECT_ASSET', 'MANUAL_CLEANUP'
);
CREATE TYPE "StorageMutationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "UploadSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorPersonId" UUID NOT NULL,
  "ownerPersonId" UUID,
  "organizationId" UUID,
  "actorMembershipId" UUID,
  "actorRoleId" UUID,
  "purpose" "StoragePurpose" NOT NULL,
  "visibility" "StorageVisibility" NOT NULL,
  "state" "UploadSessionState" NOT NULL DEFAULT 'CREATED',
  "expectedMimeType" VARCHAR(100) NOT NULL,
  "expectedSizeBytes" BIGINT NOT NULL,
  "expectedChecksumSha256" VARCHAR(64),
  "displayName" VARCHAR(180),
  "provider" "StorageProviderKind" NOT NULL,
  "objectKey" VARCHAR(512) NOT NULL,
  "providerUploadReference" VARCHAR(180),
  "providerCleanupClaimId" UUID,
  "providerCleanupClaimedAt" TIMESTAMPTZ(6),
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "targetIssuedAt" TIMESTAMPTZ(6),
  "uploadedAt" TIMESTAMPTZ(6),
  "finalizedAt" TIMESTAMPTZ(6),
  "abortedAt" TIMESTAMPTZ(6),
  "failureCode" VARCHAR(80),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UploadSession_positive_size_check" CHECK ("expectedSizeBytes" > 0),
  CONSTRAINT "UploadSession_positive_version_check" CHECK ("version" > 0),
  CONSTRAINT "UploadSession_checksum_check" CHECK (
    "expectedChecksumSha256" IS NULL OR "expectedChecksumSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "UploadSession_cleanup_claim_check" CHECK (
    ("providerCleanupClaimId" IS NULL) = ("providerCleanupClaimedAt" IS NULL)
  ),
  CONSTRAINT "UploadSession_owner_scope_check" CHECK (
    (
      "purpose" = 'CUSTOMER_AVATAR'
      AND "ownerPersonId" IS NOT NULL
      AND "ownerPersonId" = "actorPersonId"
      AND "organizationId" IS NULL
      AND "actorMembershipId" IS NULL
      AND "actorRoleId" IS NULL
      AND "visibility" = 'PRIVATE'
    ) OR (
      "purpose" IN (
        'BUSINESS_LOGO', 'BUSINESS_COVER', 'BUSINESS_GALLERY_IMAGE', 'SERVICE_IMAGE',
        'STORE_LOGO', 'STORE_COVER', 'PRODUCT_IMAGE', 'RESTAURANT_MENU_IMAGE'
      )
      AND "ownerPersonId" IS NULL
      AND "organizationId" IS NOT NULL
      AND "actorMembershipId" IS NOT NULL
      AND "actorRoleId" IS NOT NULL
      AND "visibility" = 'PUBLIC'
    ) OR (
      "purpose" = 'INTERNAL_STORAGE_TEST'
      AND "ownerPersonId" IS NULL
      AND "organizationId" IS NULL
      AND "actorMembershipId" IS NULL
      AND "actorRoleId" IS NULL
      AND "visibility" = 'INTERNAL'
    )
  ),
  CONSTRAINT "UploadSession_object_key_check" CHECK (
    "objectKey" !~ '[\\\\]'
    AND POSITION('..' IN "objectKey") = 0
    AND "objectKey" ~ '^(development|test|staging|production)/[a-z0-9-]+/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "UploadSession_terminal_timestamps_check" CHECK (
    ("state" <> 'FINALIZED' OR "finalizedAt" IS NOT NULL)
    AND ("state" <> 'ABORTED' OR "abortedAt" IS NOT NULL)
  )
);

CREATE TABLE "StoredAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "uploadSessionId" UUID NOT NULL,
  "ownerPersonId" UUID,
  "organizationId" UUID,
  "createdByPersonId" UUID NOT NULL,
  "purpose" "StoragePurpose" NOT NULL,
  "visibility" "StorageVisibility" NOT NULL,
  "state" "StoredAssetState" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "provider" "StorageProviderKind" NOT NULL,
  "objectKey" VARCHAR(512) NOT NULL,
  "providerObjectVersion" VARCHAR(180),
  "providerCleanupClaimId" UUID,
  "providerCleanupClaimedAt" TIMESTAMPTZ(6),
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksumSha256" VARCHAR(64) NOT NULL,
  "displayName" VARCHAR(180),
  "inspectionOutcome" "StorageInspectionOutcome" NOT NULL,
  "scannerOutcome" "StorageScannerOutcome" NOT NULL,
  "inspectionMetadata" JSONB,
  "failureCode" VARCHAR(80),
  "version" INTEGER NOT NULL DEFAULT 1,
  "readyAt" TIMESTAMPTZ(6),
  "quarantinedAt" TIMESTAMPTZ(6),
  "rejectedAt" TIMESTAMPTZ(6),
  "deleteRequestedAt" TIMESTAMPTZ(6),
  "deletedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "StoredAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredAsset_positive_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "StoredAsset_positive_version_check" CHECK ("version" > 0),
  CONSTRAINT "StoredAsset_checksum_check" CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "StoredAsset_cleanup_claim_check" CHECK (
    ("providerCleanupClaimId" IS NULL) = ("providerCleanupClaimedAt" IS NULL)
  ),
  CONSTRAINT "StoredAsset_owner_scope_check" CHECK (
    (
      "purpose" = 'CUSTOMER_AVATAR'
      AND "ownerPersonId" IS NOT NULL
      AND "organizationId" IS NULL
      AND "visibility" = 'PRIVATE'
    ) OR (
      "purpose" IN (
        'BUSINESS_LOGO', 'BUSINESS_COVER', 'BUSINESS_GALLERY_IMAGE', 'SERVICE_IMAGE',
        'STORE_LOGO', 'STORE_COVER', 'PRODUCT_IMAGE', 'RESTAURANT_MENU_IMAGE'
      )
      AND "ownerPersonId" IS NULL
      AND "organizationId" IS NOT NULL
      AND "visibility" = 'PUBLIC'
    ) OR (
      "purpose" = 'INTERNAL_STORAGE_TEST'
      AND "ownerPersonId" IS NULL
      AND "organizationId" IS NULL
      AND "visibility" = 'INTERNAL'
    )
  ),
  CONSTRAINT "StoredAsset_object_key_check" CHECK (
    "objectKey" !~ '[\\\\]'
    AND POSITION('..' IN "objectKey") = 0
    AND "objectKey" ~ '^(development|test|staging|production)/[a-z0-9-]+/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "StoredAsset_state_timestamp_check" CHECK (
    ("state" <> 'READY' OR "readyAt" IS NOT NULL)
    AND ("state" <> 'QUARANTINED' OR "quarantinedAt" IS NOT NULL)
    AND ("state" <> 'REJECTED' OR "rejectedAt" IS NOT NULL)
    AND ("state" <> 'DELETE_PENDING' OR "deleteRequestedAt" IS NOT NULL)
    AND ("state" <> 'DELETED' OR "deletedAt" IS NOT NULL)
  )
);

CREATE TABLE "StorageMutation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorPersonId" UUID NOT NULL,
  "organizationId" UUID,
  "action" "StorageMutationAction" NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "targetType" VARCHAR(40) NOT NULL,
  "targetId" UUID,
  "expectedVersion" INTEGER,
  "status" "StorageMutationStatus" NOT NULL DEFAULT 'PROCESSING',
  "result" JSONB,
  "failureCode" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "StorageMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorageMutation_request_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "StorageMutation_expected_version_check" CHECK (
    "expectedVersion" IS NULL OR "expectedVersion" > 0
  )
);

CREATE UNIQUE INDEX "UploadSession_objectKey_key" ON "UploadSession"("objectKey");
CREATE INDEX "UploadSession_actorPersonId_createdAt_id_idx" ON "UploadSession"("actorPersonId", "createdAt", "id");
CREATE INDEX "UploadSession_ownerPersonId_createdAt_id_idx" ON "UploadSession"("ownerPersonId", "createdAt", "id");
CREATE INDEX "UploadSession_organizationId_createdAt_id_idx" ON "UploadSession"("organizationId", "createdAt", "id");
CREATE INDEX "UploadSession_ownerPersonId_state_expiresAt_idx" ON "UploadSession"("ownerPersonId", "state", "expiresAt");
CREATE INDEX "UploadSession_organizationId_state_expiresAt_idx" ON "UploadSession"("organizationId", "state", "expiresAt");
CREATE INDEX "UploadSession_actorPersonId_createdAt_idx" ON "UploadSession"("actorPersonId", "createdAt");
CREATE INDEX "UploadSession_organizationId_createdAt_idx" ON "UploadSession"("organizationId", "createdAt");
CREATE INDEX "UploadSession_state_expiresAt_id_idx" ON "UploadSession"("state", "expiresAt", "id");
CREATE INDEX "UploadSession_provider_state_expiresAt_id_idx" ON "UploadSession"("provider", "state", "expiresAt", "id");

CREATE UNIQUE INDEX "StoredAsset_uploadSessionId_key" ON "StoredAsset"("uploadSessionId");
CREATE UNIQUE INDEX "StoredAsset_objectKey_key" ON "StoredAsset"("objectKey");
CREATE INDEX "StoredAsset_ownerPersonId_createdAt_id_idx" ON "StoredAsset"("ownerPersonId", "createdAt", "id");
CREATE INDEX "StoredAsset_organizationId_createdAt_id_idx" ON "StoredAsset"("organizationId", "createdAt", "id");
CREATE INDEX "StoredAsset_ownerPersonId_purpose_state_idx" ON "StoredAsset"("ownerPersonId", "purpose", "state");
CREATE INDEX "StoredAsset_organizationId_purpose_state_idx" ON "StoredAsset"("organizationId", "purpose", "state");
CREATE INDEX "StoredAsset_createdAt_id_idx" ON "StoredAsset"("createdAt", "id");
CREATE INDEX "StoredAsset_state_createdAt_id_idx" ON "StoredAsset"("state", "createdAt", "id");
CREATE INDEX "StoredAsset_state_deleteRequestedAt_id_idx" ON "StoredAsset"("state", "deleteRequestedAt", "id");
CREATE INDEX "StoredAsset_purpose_state_createdAt_id_idx" ON "StoredAsset"("purpose", "state", "createdAt", "id");

CREATE UNIQUE INDEX "StorageMutation_actorPersonId_idempotencyKey_key"
ON "StorageMutation"("actorPersonId", "idempotencyKey");
CREATE INDEX "StorageMutation_targetType_targetId_createdAt_id_idx" ON "StorageMutation"("targetType", "targetId", "createdAt", "id");
CREATE INDEX "StorageMutation_status_createdAt_id_idx" ON "StorageMutation"("status", "createdAt", "id");
CREATE INDEX "StorageMutation_organizationId_createdAt_id_idx" ON "StorageMutation"("organizationId", "createdAt", "id");

ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_actorPersonId_fkey"
FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_ownerPersonId_fkey"
FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_actorMembershipId_fkey"
FOREIGN KEY ("actorMembershipId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoredAsset" ADD CONSTRAINT "StoredAsset_uploadSessionId_fkey"
FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredAsset" ADD CONSTRAINT "StoredAsset_ownerPersonId_fkey"
FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredAsset" ADD CONSTRAINT "StoredAsset_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredAsset" ADD CONSTRAINT "StoredAsset_createdByPersonId_fkey"
FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StorageMutation" ADD CONSTRAINT "StorageMutation_actorPersonId_fkey"
FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorageMutation" ADD CONSTRAINT "StorageMutation_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
