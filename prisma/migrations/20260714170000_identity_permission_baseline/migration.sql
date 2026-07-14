-- Existing memberships remain active. Soft-deletion metadata lets every
-- tenant authorization query reject inactive and deleted memberships.
ALTER TABLE "OrganizationMember"
ADD COLUMN "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

-- A NULL expiry preserves existing non-expiring admin grants. New and updated
-- grants can now be bounded without changing the AdminAccess status lifecycle.
ALTER TABLE "AdminAccess"
ADD COLUMN "expiresAt" TIMESTAMPTZ(6);

CREATE INDEX "OrganizationMember_organizationId_status_deletedAt_idx"
ON "OrganizationMember"("organizationId", "status", "deletedAt");

CREATE INDEX "AdminAccess_status_expiresAt_idx"
ON "AdminAccess"("status", "expiresAt");
