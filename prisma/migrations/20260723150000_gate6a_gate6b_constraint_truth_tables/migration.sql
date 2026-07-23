-- Gate 6A/6B remediation: PostgreSQL CHECK constraints reject only FALSE.
-- Every nullable lifecycle tuple below is therefore expressed as a complete
-- TRUE/FALSE truth table. This migration never fabricates or repairs rows.

DO $$
DECLARE
  processing_missing_claim_count BIGINT;
  processing_invalid_fence_count BIGINT;
  delete_partial_claim_count BIGINT;
  illegal_state_claim_count BIGINT;
  rescan_partial_claim_count BIGINT;
  rescan_invalid_fence_count BIGINT;
  worker_null_batch_count BIGINT;
  worker_null_identity_count BIGINT;
  worker_null_fence_count BIGINT;
  worker_invalid_result_count BIGINT;
  worker_invalid_lease_count BIGINT;
  non_worker_operation_count BIGINT;
  invalid_output_count BIGINT;
  invalid_profile_dimensions_count BIGINT;
  invalid_deletion_lifecycle_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO processing_missing_claim_count
  FROM "MediaRendition"
  WHERE "state" = 'PROCESSING'
    AND (
      "claimJobId" IS NULL
      OR "claimLeaseToken" IS NULL
      OR "claimFencingToken" IS NULL
      OR "claimExpiresAt" IS NULL
    );

  SELECT COUNT(*) INTO processing_invalid_fence_count
  FROM "MediaRendition"
  WHERE "state" = 'PROCESSING'
    AND "claimFencingToken" IS NOT NULL
    AND "claimFencingToken" < 1;

  SELECT COUNT(*) INTO delete_partial_claim_count
  FROM "MediaRendition"
  WHERE "state" = 'DELETE_PENDING'
    AND NOT (
      (
        "claimJobId" IS NULL
        AND "claimLeaseToken" IS NULL
        AND "claimFencingToken" IS NULL
        AND "claimExpiresAt" IS NULL
      )
      OR
      (
        "claimJobId" IS NOT NULL
        AND "claimLeaseToken" IS NOT NULL
        AND "claimFencingToken" IS NOT NULL
        AND "claimFencingToken" >= 1
        AND "claimExpiresAt" IS NOT NULL
      )
    );

  SELECT COUNT(*) INTO illegal_state_claim_count
  FROM "MediaRendition"
  WHERE "state" IN ('PENDING', 'READY', 'FAILED', 'SUPERSEDED', 'DELETED')
    AND (
      "claimJobId" IS NOT NULL
      OR "claimLeaseToken" IS NOT NULL
      OR "claimFencingToken" IS NOT NULL
      OR "claimExpiresAt" IS NOT NULL
    );

  SELECT COUNT(*) INTO rescan_partial_claim_count
  FROM "StoredAsset"
  WHERE NOT (
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
      AND "rescanClaimFencingToken" IS NOT NULL
      AND "rescanClaimFencingToken" >= 1
      AND "rescanClaimExpiresAt" IS NOT NULL
    )
  );

  SELECT COUNT(*) INTO rescan_invalid_fence_count
  FROM "StoredAsset"
  WHERE "rescanClaimFencingToken" IS NOT NULL
    AND "rescanClaimFencingToken" < 1;

  SELECT COUNT(*) INTO worker_null_batch_count
  FROM "PlatformJobMutation"
  WHERE "action" = 'WORKER_BATCH'
    AND "operationBatchSize" IS NULL;

  SELECT COUNT(*) INTO worker_null_identity_count
  FROM "PlatformJobMutation"
  WHERE "action" = 'WORKER_BATCH'
    AND (
      "operationWorkerId" IS NULL
      OR "operationWorkerId" !~ '^(operation:[a-f0-9]{64}|admin:[a-f0-9]{16}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    );

  SELECT COUNT(*) INTO worker_null_fence_count
  FROM "PlatformJobMutation"
  WHERE "action" = 'WORKER_BATCH'
    AND "operationFencingToken" IS NULL;

  SELECT COUNT(*) INTO worker_invalid_result_count
  FROM "PlatformJobMutation"
  WHERE "action" = 'WORKER_BATCH'
    AND (
      NOT ("result" ? 'state')
      OR jsonb_typeof("result"->'state') IS DISTINCT FROM 'string'
      OR "result"->>'state' NOT IN ('PROCESSING', 'COMPLETE')
      OR (
        "operationCompletedAt" IS NULL
        AND "result"->>'state' IS DISTINCT FROM 'PROCESSING'
      )
      OR (
        "operationCompletedAt" IS NOT NULL
        AND "result"->>'state' IS DISTINCT FROM 'COMPLETE'
      )
    );

  SELECT COUNT(*) INTO worker_invalid_lease_count
  FROM "PlatformJobMutation"
  WHERE "action" = 'WORKER_BATCH'
    AND NOT (
      (
        "operationCompletedAt" IS NULL
        AND "operationLeaseToken" IS NOT NULL
        AND "operationLeaseExpiresAt" IS NOT NULL
      )
      OR
      (
        "operationCompletedAt" IS NOT NULL
        AND "operationLeaseToken" IS NULL
        AND "operationLeaseExpiresAt" IS NULL
      )
    );

  SELECT COUNT(*) INTO non_worker_operation_count
  FROM "PlatformJobMutation"
  WHERE "action" <> 'WORKER_BATCH'
    AND (
      "operationBatchSize" IS NOT NULL
      OR "operationWorkerId" IS NOT NULL
      OR "operationLeaseToken" IS NOT NULL
      OR "operationFencingToken" IS NOT NULL
      OR "operationLeaseExpiresAt" IS NOT NULL
      OR "operationCompletedAt" IS NOT NULL
    );

  SELECT COUNT(*) INTO invalid_output_count
  FROM "MediaRendition"
  WHERE NOT (
    (
      "state" IN ('READY', 'SUPERSEDED')
      AND "mimeType" IS NOT NULL
      AND "mimeType" = 'image/webp'
      AND "sizeBytes" IS NOT NULL
      AND "sizeBytes" BETWEEN 1 AND 4194304
      AND "checksumSha256" IS NOT NULL
      AND "checksumSha256" ~ '^[a-f0-9]{64}$'
      AND "width" IS NOT NULL
      AND "width" BETWEEN 1 AND 1600
      AND "height" IS NOT NULL
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
          "mimeType" IS NOT NULL
          AND "mimeType" = 'image/webp'
          AND "sizeBytes" IS NOT NULL
          AND "sizeBytes" BETWEEN 1 AND 4194304
          AND "checksumSha256" IS NOT NULL
          AND "checksumSha256" ~ '^[a-f0-9]{64}$'
          AND "width" IS NOT NULL
          AND "width" BETWEEN 1 AND 1600
          AND "height" IS NOT NULL
          AND "height" BETWEEN 1 AND 1600
          AND "width"::bigint * "height"::bigint <= 2560000
          AND "readyAt" IS NOT NULL
        )
      )
    )
  );

  SELECT COUNT(*) INTO invalid_profile_dimensions_count
  FROM "MediaRendition"
  WHERE NOT (
    ("width" IS NULL AND "height" IS NULL)
    OR
    (
      "width" IS NOT NULL
      AND "height" IS NOT NULL
      AND "width" >= 1
      AND "height" >= 1
      AND (
        ("profile" = 'AVATAR_256_WEBP' AND "width" <= 256 AND "height" <= 256)
        OR ("profile" = 'CARD_640_WEBP' AND "width" <= 640 AND "height" <= 640)
        OR ("profile" = 'HERO_1600_WEBP' AND "width" <= 1600 AND "height" <= 1600)
      )
    )
  );

  SELECT COUNT(*) INTO invalid_deletion_lifecycle_count
  FROM "MediaRendition"
  WHERE NOT (
    (
      "state" = 'DELETE_PENDING'
      AND "deleteRequestedAt" IS NOT NULL
      AND "deletedAt" IS NULL
    )
    OR
    (
      "state" = 'DELETED'
      AND "deleteRequestedAt" IS NOT NULL
      AND "deletedAt" IS NOT NULL
    )
    OR
    (
      "state" NOT IN ('DELETE_PENDING', 'DELETED')
      AND "deleteRequestedAt" IS NULL
      AND "deletedAt" IS NULL
    )
  );

  IF processing_missing_claim_count <> 0
    OR processing_invalid_fence_count <> 0
    OR delete_partial_claim_count <> 0
    OR illegal_state_claim_count <> 0
    OR rescan_partial_claim_count <> 0
    OR rescan_invalid_fence_count <> 0
    OR worker_null_batch_count <> 0
    OR worker_null_identity_count <> 0
    OR worker_null_fence_count <> 0
    OR worker_invalid_result_count <> 0
    OR worker_invalid_lease_count <> 0
    OR non_worker_operation_count <> 0
    OR invalid_output_count <> 0
    OR invalid_profile_dimensions_count <> 0
    OR invalid_deletion_lifecycle_count <> 0 THEN
    RAISE EXCEPTION
      'Gate 6A/6B constraint preflight failed: processing_missing_claim=%, processing_invalid_fence=%, delete_partial_claim=%, illegal_state_claim=%, rescan_partial_claim=%, rescan_invalid_fence=%, worker_null_batch=%, worker_null_identity=%, worker_null_fence=%, worker_invalid_result=%, worker_invalid_lease=%, non_worker_operation=%, invalid_output=%, invalid_profile_dimensions=%, invalid_deletion_lifecycle=%',
      processing_missing_claim_count,
      processing_invalid_fence_count,
      delete_partial_claim_count,
      illegal_state_claim_count,
      rescan_partial_claim_count,
      rescan_invalid_fence_count,
      worker_null_batch_count,
      worker_null_identity_count,
      worker_null_fence_count,
      worker_invalid_result_count,
      worker_invalid_lease_count,
      non_worker_operation_count,
      invalid_output_count,
      invalid_profile_dimensions_count,
      invalid_deletion_lifecycle_count;
  END IF;
END $$;

ALTER TABLE "PlatformJobMutation"
  DROP CONSTRAINT "PlatformJobMutation_operation_check";

ALTER TABLE "PlatformJobMutation"
  ADD CONSTRAINT "PlatformJobMutation_operation_check" CHECK (
    (
      "action" = 'WORKER_BATCH'
      AND "operationBatchSize" IS NOT NULL
      AND "operationBatchSize" BETWEEN 1 AND 10
      AND "operationWorkerId" IS NOT NULL
      AND "operationWorkerId" ~ '^(operation:[a-f0-9]{64}|admin:[a-f0-9]{16}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
      AND "operationFencingToken" IS NOT NULL
      AND "operationFencingToken" >= 1
      AND (
        (
          "operationCompletedAt" IS NULL
          AND "operationLeaseToken" IS NOT NULL
          AND "operationLeaseExpiresAt" IS NOT NULL
          AND "result" ? 'state'
          AND jsonb_typeof("result"->'state') = 'string'
          AND "result"->>'state' = 'PROCESSING'
        )
        OR
        (
          "operationCompletedAt" IS NOT NULL
          AND "operationLeaseToken" IS NULL
          AND "operationLeaseExpiresAt" IS NULL
          AND "result" ? 'state'
          AND jsonb_typeof("result"->'state') = 'string'
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

ALTER TABLE "StoredAsset"
  DROP CONSTRAINT "StoredAsset_rescan_claim_check";

ALTER TABLE "StoredAsset"
  ADD CONSTRAINT "StoredAsset_rescan_claim_check" CHECK (
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
      AND "rescanClaimFencingToken" IS NOT NULL
      AND "rescanClaimFencingToken" >= 1
      AND "rescanClaimExpiresAt" IS NOT NULL
    )
  );

ALTER TABLE "MediaRendition"
  DROP CONSTRAINT "MediaRendition_claim_check",
  DROP CONSTRAINT "MediaRendition_output_check",
  DROP CONSTRAINT "MediaRendition_profile_bounds_check",
  DROP CONSTRAINT "MediaRendition_delete_check";

ALTER TABLE "MediaRendition"
  ADD CONSTRAINT "MediaRendition_claim_check" CHECK (
    (
      "state" = 'PROCESSING'
      AND "claimJobId" IS NOT NULL
      AND "claimLeaseToken" IS NOT NULL
      AND "claimFencingToken" IS NOT NULL
      AND "claimFencingToken" >= 1
      AND "claimExpiresAt" IS NOT NULL
    )
    OR
    (
      "state" = 'DELETE_PENDING'
      AND (
        (
          "claimJobId" IS NULL
          AND "claimLeaseToken" IS NULL
          AND "claimFencingToken" IS NULL
          AND "claimExpiresAt" IS NULL
        )
        OR
        (
          "claimJobId" IS NOT NULL
          AND "claimLeaseToken" IS NOT NULL
          AND "claimFencingToken" IS NOT NULL
          AND "claimFencingToken" >= 1
          AND "claimExpiresAt" IS NOT NULL
        )
      )
    )
    OR
    (
      "state" IN ('PENDING', 'READY', 'FAILED', 'SUPERSEDED', 'DELETED')
      AND "claimJobId" IS NULL
      AND "claimLeaseToken" IS NULL
      AND "claimFencingToken" IS NULL
      AND "claimExpiresAt" IS NULL
    )
  ),
  ADD CONSTRAINT "MediaRendition_output_check" CHECK (
    (
      "state" IN ('READY', 'SUPERSEDED')
      AND "mimeType" IS NOT NULL
      AND "mimeType" = 'image/webp'
      AND "sizeBytes" IS NOT NULL
      AND "sizeBytes" BETWEEN 1 AND 4194304
      AND "checksumSha256" IS NOT NULL
      AND "checksumSha256" ~ '^[a-f0-9]{64}$'
      AND "width" IS NOT NULL
      AND "width" BETWEEN 1 AND 1600
      AND "height" IS NOT NULL
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
          "mimeType" IS NOT NULL
          AND "mimeType" = 'image/webp'
          AND "sizeBytes" IS NOT NULL
          AND "sizeBytes" BETWEEN 1 AND 4194304
          AND "checksumSha256" IS NOT NULL
          AND "checksumSha256" ~ '^[a-f0-9]{64}$'
          AND "width" IS NOT NULL
          AND "width" BETWEEN 1 AND 1600
          AND "height" IS NOT NULL
          AND "height" BETWEEN 1 AND 1600
          AND "width"::bigint * "height"::bigint <= 2560000
          AND "readyAt" IS NOT NULL
        )
      )
    )
  ),
  ADD CONSTRAINT "MediaRendition_profile_bounds_check" CHECK (
    ("width" IS NULL AND "height" IS NULL)
    OR
    (
      "width" IS NOT NULL
      AND "height" IS NOT NULL
      AND "width" >= 1
      AND "height" >= 1
      AND (
        ("profile" = 'AVATAR_256_WEBP' AND "width" <= 256 AND "height" <= 256)
        OR ("profile" = 'CARD_640_WEBP' AND "width" <= 640 AND "height" <= 640)
        OR ("profile" = 'HERO_1600_WEBP' AND "width" <= 1600 AND "height" <= 1600)
      )
    )
  ),
  ADD CONSTRAINT "MediaRendition_delete_check" CHECK (
    (
      "state" = 'DELETE_PENDING'
      AND "deleteRequestedAt" IS NOT NULL
      AND "deletedAt" IS NULL
    )
    OR
    (
      "state" = 'DELETED'
      AND "deleteRequestedAt" IS NOT NULL
      AND "deletedAt" IS NOT NULL
    )
    OR
    (
      "state" NOT IN ('DELETE_PENDING', 'DELETED')
      AND "deleteRequestedAt" IS NULL
      AND "deletedAt" IS NULL
    )
  );
