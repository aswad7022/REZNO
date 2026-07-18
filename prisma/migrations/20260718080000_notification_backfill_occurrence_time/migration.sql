-- Canonical backfill notifications predate the producer timestamp policy that
-- binds the inbox timestamp to the domain occurrence time. Limit this repair
-- to deterministic backfill keys; live and legacy rows remain untouched.
UPDATE "Notification"
SET "createdAt" = "occurredAt"
WHERE "eventKey" LIKE 'backfill:%'
  AND "createdAt" IS DISTINCT FROM "occurredAt";
