-- Gate 6B: additive storage/media automation schema only.
-- This migration creates no jobs, schedules, assets, renditions, bindings, or actors.

ALTER TYPE "PlatformJobType" ADD VALUE 'STORAGE_MAINTENANCE_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'STORAGE_ORPHAN_CLEANUP';
ALTER TYPE "PlatformJobType" ADD VALUE 'STORAGE_ASSET_DELETE_RETRY';
ALTER TYPE "PlatformJobType" ADD VALUE 'STORAGE_RESCAN_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'STORAGE_ASSET_RESCAN';
ALTER TYPE "PlatformJobType" ADD VALUE 'MEDIA_RENDITION_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'MEDIA_RENDITION_GENERATE';
ALTER TYPE "PlatformJobType" ADD VALUE 'MEDIA_RENDITION_CLEANUP_DISCOVERY';
ALTER TYPE "PlatformJobType" ADD VALUE 'MEDIA_RENDITION_DELETE';

ALTER TYPE "PlatformJobSource" ADD VALUE 'DOMAIN_DISCOVERY';

ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'STORAGE_MAINTENANCE_DISCOVERY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'STORAGE_RESCAN_DISCOVERY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'MEDIA_RENDITION_DISCOVERY';
ALTER TYPE "PlatformJobScheduleKey" ADD VALUE 'MEDIA_RENDITION_CLEANUP_DISCOVERY';

CREATE TYPE "MediaRenditionProfile" AS ENUM (
  'AVATAR_256_WEBP',
  'CARD_640_WEBP',
  'HERO_1600_WEBP'
);

CREATE TYPE "MediaRenditionState" AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'SUPERSEDED',
  'DELETE_PENDING',
  'DELETED'
);

ALTER TABLE "StoredAsset"
  ADD COLUMN "inspectionPolicyVersion" INTEGER,
  ADD COLUMN "lastRescannedAt" TIMESTAMPTZ(6),
  ADD COLUMN "rescanClaimJobId" UUID,
  ADD COLUMN "rescanClaimLeaseToken" UUID,
  ADD COLUMN "rescanClaimFencingToken" BIGINT,
  ADD COLUMN "rescanClaimExpiresAt" TIMESTAMPTZ(6),
  ADD CONSTRAINT "StoredAsset_inspection_policy_version_check"
    CHECK ("inspectionPolicyVersion" IS NULL OR "inspectionPolicyVersion" > 0),
  ADD CONSTRAINT "StoredAsset_rescan_claim_check"
    CHECK (
      (
        "rescanClaimJobId" IS NULL
        AND "rescanClaimLeaseToken" IS NULL
        AND "rescanClaimFencingToken" IS NULL
        AND "rescanClaimExpiresAt" IS NULL
      )
      OR
      (
        "rescanClaimJobId" IS NOT NULL
        AND "rescanClaimLeaseToken" IS NOT NULL
        AND "rescanClaimFencingToken" >= 1
        AND "rescanClaimExpiresAt" IS NOT NULL
      )
    );

ALTER TABLE "PlatformJob"
  ADD COLUMN "parentJobId" UUID;

ALTER TABLE "PlatformJob" DROP CONSTRAINT "PlatformJob_source_check";
ALTER TABLE "PlatformJob"
  ADD CONSTRAINT "PlatformJob_source_check"
  CHECK (
    (
      "source" = 'ADMIN_MANUAL'
      AND "scheduleId" IS NULL
      AND "parentJobId" IS NULL
      AND "createdByAdminUserId" IS NOT NULL
    )
    OR
    (
      "source" = 'SCHEDULE'
      AND "scheduleId" IS NOT NULL
      AND "parentJobId" IS NULL
      AND "createdByAdminUserId" IS NOT NULL
    )
    OR
    (
      "source" = 'DOMAIN_DISCOVERY'
      AND "scheduleId" IS NULL
      AND "parentJobId" IS NOT NULL
      AND "createdByAdminUserId" IS NOT NULL
    )
  );

ALTER TABLE "PlatformJobSchedule" DROP CONSTRAINT "PlatformJobSchedule_mapping_check";
ALTER TABLE "PlatformJobSchedule"
  ADD CONSTRAINT "PlatformJobSchedule_mapping_check"
  CHECK (
    ("scheduleKey" = 'PLATFORM_HEALTH_PROBE' AND "jobType" = 'PLATFORM_HEALTH_PROBE')
    OR ("scheduleKey" = 'STORAGE_MAINTENANCE_DISCOVERY' AND "jobType" = 'STORAGE_MAINTENANCE_DISCOVERY')
    OR ("scheduleKey" = 'STORAGE_RESCAN_DISCOVERY' AND "jobType" = 'STORAGE_RESCAN_DISCOVERY')
    OR ("scheduleKey" = 'MEDIA_RENDITION_DISCOVERY' AND "jobType" = 'MEDIA_RENDITION_DISCOVERY')
    OR ("scheduleKey" = 'MEDIA_RENDITION_CLEANUP_DISCOVERY' AND "jobType" = 'MEDIA_RENDITION_CLEANUP_DISCOVERY')
  );

CREATE TABLE "MediaRendition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sourceAssetId" UUID NOT NULL,
  "sourceAssetVersion" INTEGER NOT NULL,
  "sourceChecksumSha256" VARCHAR(64) NOT NULL,
  "sourceProviderObjectVersion" VARCHAR(180),
  "sourceFingerprint" VARCHAR(64) NOT NULL,
  "profile" "MediaRenditionProfile" NOT NULL,
  "state" "MediaRenditionState" NOT NULL DEFAULT 'PENDING',
  "provider" "StorageProviderKind" NOT NULL,
  "objectKey" VARCHAR(512) NOT NULL,
  "providerObjectVersion" VARCHAR(180),
  "mimeType" VARCHAR(100),
  "sizeBytes" BIGINT,
  "checksumSha256" VARCHAR(64),
  "width" INTEGER,
  "height" INTEGER,
  "claimJobId" UUID,
  "claimLeaseToken" UUID,
  "claimFencingToken" BIGINT,
  "claimExpiresAt" TIMESTAMPTZ(6),
  "failureCode" VARCHAR(80),
  "version" INTEGER NOT NULL DEFAULT 1,
  "readyAt" TIMESTAMPTZ(6),
  "deleteRequestedAt" TIMESTAMPTZ(6),
  "deletedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaRendition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaRendition_source_version_check" CHECK ("sourceAssetVersion" > 0),
  CONSTRAINT "MediaRendition_source_checksum_check" CHECK ("sourceChecksumSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MediaRendition_source_fingerprint_check" CHECK ("sourceFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MediaRendition_checksum_check" CHECK ("checksumSha256" IS NULL OR "checksumSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MediaRendition_object_key_check" CHECK (
    "objectKey" !~ '[\\\\]'
    AND POSITION('..' IN "objectKey") = 0
    AND "objectKey" ~ '^(development|test|staging|production)/media-rendition/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "MediaRendition_claim_check" CHECK (
    (
      "claimJobId" IS NULL
      AND "claimLeaseToken" IS NULL
      AND "claimFencingToken" IS NULL
      AND "claimExpiresAt" IS NULL
    )
    OR
    (
      "state" IN ('PROCESSING', 'DELETE_PENDING')
      AND "claimJobId" IS NOT NULL
      AND "claimLeaseToken" IS NOT NULL
      AND "claimFencingToken" >= 1
      AND "claimExpiresAt" IS NOT NULL
    )
  ),
  CONSTRAINT "MediaRendition_output_check" CHECK (
    (
      "state" IN ('READY', 'SUPERSEDED')
      AND "mimeType" = 'image/webp'
      AND "sizeBytes" BETWEEN 1 AND 4194304
      AND "checksumSha256" IS NOT NULL
      AND "width" BETWEEN 1 AND 1600
      AND "height" BETWEEN 1 AND 1600
      AND "width"::bigint * "height"::bigint <= 2560000
      AND "readyAt" IS NOT NULL
    )
    OR
    (
      "state" IN ('PENDING', 'PROCESSING', 'FAILED')
      AND "providerObjectVersion" IS NULL
      AND "mimeType" IS NULL
      AND "sizeBytes" IS NULL
      AND "checksumSha256" IS NULL
      AND "width" IS NULL
      AND "height" IS NULL
      AND "readyAt" IS NULL
    )
    OR
    (
      "state" IN ('DELETE_PENDING', 'DELETED')
      AND (
        (
          "providerObjectVersion" IS NULL
          AND "mimeType" IS NULL
          AND "sizeBytes" IS NULL
          AND "checksumSha256" IS NULL
          AND "width" IS NULL
          AND "height" IS NULL
          AND "readyAt" IS NULL
        )
        OR
        (
          "mimeType" = 'image/webp'
          AND "sizeBytes" BETWEEN 1 AND 4194304
          AND "checksumSha256" IS NOT NULL
          AND "width" BETWEEN 1 AND 1600
          AND "height" BETWEEN 1 AND 1600
          AND "width"::bigint * "height"::bigint <= 2560000
          AND "readyAt" IS NOT NULL
        )
      )
    )
  ),
  CONSTRAINT "MediaRendition_failure_check" CHECK (
    ("state" = 'FAILED' AND "failureCode" IS NOT NULL)
    OR ("state" <> 'FAILED' AND "failureCode" IS NULL)
  ),
  CONSTRAINT "MediaRendition_profile_bounds_check" CHECK (
    "width" IS NULL
    OR ("profile" = 'AVATAR_256_WEBP' AND "width" <= 256 AND "height" <= 256)
    OR ("profile" = 'CARD_640_WEBP' AND "width" <= 640 AND "height" <= 640)
    OR ("profile" = 'HERO_1600_WEBP' AND "width" <= 1600 AND "height" <= 1600)
  ),
  CONSTRAINT "MediaRendition_delete_check" CHECK (
    ("state" = 'DELETE_PENDING' AND "deleteRequestedAt" IS NOT NULL AND "deletedAt" IS NULL)
    OR ("state" = 'DELETED' AND "deleteRequestedAt" IS NOT NULL AND "deletedAt" IS NOT NULL)
    OR ("state" NOT IN ('DELETE_PENDING', 'DELETED') AND "deletedAt" IS NULL)
  ),
  CONSTRAINT "MediaRendition_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "MediaRendition_objectKey_key"
  ON "MediaRendition"("objectKey");
CREATE UNIQUE INDEX "MediaRendition_sourceAssetId_sourceAssetVersion_profile_key"
  ON "MediaRendition"("sourceAssetId", "sourceAssetVersion", "profile");
CREATE INDEX "MediaRendition_state_updatedAt_id_idx"
  ON "MediaRendition"("state", "updatedAt", "id");
CREATE INDEX "MediaRendition_sourceAssetId_state_profile_id_idx"
  ON "MediaRendition"("sourceAssetId", "state", "profile", "id");
CREATE INDEX "MediaRendition_claimExpiresAt_id_idx"
  ON "MediaRendition"("claimExpiresAt", "id");

CREATE INDEX "StoredAsset_state_inspectionPolicyVersion_updatedAt_id_idx"
  ON "StoredAsset"("state", "inspectionPolicyVersion", "updatedAt", "id");
CREATE INDEX "StoredAsset_rescanClaimExpiresAt_id_idx"
  ON "StoredAsset"("rescanClaimExpiresAt", "id");
CREATE INDEX "PlatformJob_parentJobId_createdAt_id_idx"
  ON "PlatformJob"("parentJobId", "createdAt", "id");

ALTER TABLE "PlatformJob"
  ADD CONSTRAINT "PlatformJob_parentJobId_fkey"
  FOREIGN KEY ("parentJobId") REFERENCES "PlatformJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoredAsset"
  ADD CONSTRAINT "StoredAsset_rescanClaimJobId_fkey"
  FOREIGN KEY ("rescanClaimJobId") REFERENCES "PlatformJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaRendition"
  ADD CONSTRAINT "MediaRendition_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "StoredAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MediaRendition_claimJobId_fkey"
  FOREIGN KEY ("claimJobId") REFERENCES "PlatformJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
