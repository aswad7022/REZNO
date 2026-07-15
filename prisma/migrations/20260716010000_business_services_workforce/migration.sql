ALTER TYPE "ServiceStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "Service"
ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

DROP INDEX "Service_organizationId_status_idx";

CREATE INDEX "Service_organizationId_status_deletedAt_idx"
ON "Service"("organizationId", "status", "deletedAt");

ALTER TABLE "BranchService"
ADD COLUMN "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
