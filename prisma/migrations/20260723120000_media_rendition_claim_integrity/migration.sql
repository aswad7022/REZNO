-- Gate 6B remediation: exact MediaRendition claim lifecycle.
-- This migration never fabricates claim ownership or rewrites domain rows.

DO $$
DECLARE
  claimless_processing_count BIGINT;
  partial_or_invalid_claim_count BIGINT;
  illegal_state_claim_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO claimless_processing_count
  FROM "MediaRendition"
  WHERE "state" = 'PROCESSING'
    AND "claimJobId" IS NULL
    AND "claimLeaseToken" IS NULL
    AND "claimFencingToken" IS NULL
    AND "claimExpiresAt" IS NULL;

  SELECT COUNT(*) INTO partial_or_invalid_claim_count
  FROM "MediaRendition"
  WHERE (
    num_nonnulls("claimJobId", "claimLeaseToken", "claimFencingToken", "claimExpiresAt") BETWEEN 1 AND 3
    OR (
      num_nonnulls("claimJobId", "claimLeaseToken", "claimFencingToken", "claimExpiresAt") = 4
      AND "claimFencingToken" < 1
    )
  );

  SELECT COUNT(*) INTO illegal_state_claim_count
  FROM "MediaRendition"
  WHERE "state" IN ('PENDING', 'READY', 'FAILED', 'SUPERSEDED', 'DELETED')
    AND num_nonnulls("claimJobId", "claimLeaseToken", "claimFencingToken", "claimExpiresAt") > 0;

  IF claimless_processing_count <> 0
    OR partial_or_invalid_claim_count <> 0
    OR illegal_state_claim_count <> 0 THEN
    RAISE EXCEPTION
      'MediaRendition claim preflight failed: claimless_processing=%, partial_or_invalid=%, illegal_state=%',
      claimless_processing_count,
      partial_or_invalid_claim_count,
      illegal_state_claim_count;
  END IF;
END $$;

ALTER TABLE "MediaRendition"
  DROP CONSTRAINT "MediaRendition_claim_check";

ALTER TABLE "MediaRendition"
  ADD CONSTRAINT "MediaRendition_claim_check" CHECK (
    (
      "state" = 'PROCESSING'
      AND "claimJobId" IS NOT NULL
      AND "claimLeaseToken" IS NOT NULL
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
  );
