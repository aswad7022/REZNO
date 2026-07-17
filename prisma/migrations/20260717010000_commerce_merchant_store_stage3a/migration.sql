-- Gate 3A reuses AdminAuditLog as the authoritative moderation replay/audit
-- ledger. Nullable columns preserve every historical Admin audit row.
ALTER TABLE "AdminAuditLog"
ADD COLUMN "idempotencyKey" UUID,
ADD COLUMN "requestHash" VARCHAR(64),
ADD COLUMN "resultVersion" TIMESTAMPTZ(6),
ADD COLUMN "result" JSONB;

CREATE UNIQUE INDEX "AdminAuditLog_adminUserId_idempotencyKey_key"
ON "AdminAuditLog"("adminUserId", "idempotencyKey");

-- Bounded deterministic Admin Store queue and general-list cursors.
CREATE INDEX "Store_status_submittedAt_id_idx"
ON "Store"("status", "submittedAt", "id");

CREATE INDEX "Store_updatedAt_id_idx"
ON "Store"("updatedAt", "id");
