-- AlterTable
ALTER TABLE "OrganizationMember"
ADD COLUMN "publicSlug" TEXT,
ADD COLUMN "isPublicProfessional" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_publicSlug_key" ON "OrganizationMember"("organizationId", "publicSlug");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_isPublicProfessional_idx" ON "OrganizationMember"("organizationId", "isPublicProfessional");
