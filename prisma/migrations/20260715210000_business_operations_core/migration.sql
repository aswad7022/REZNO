-- CreateTable
CREATE TABLE "BusinessOperationMutation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "targetType" VARCHAR(60) NOT NULL,
    "targetId" UUID,
    "resultVersion" TIMESTAMPTZ(6) NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessOperationMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessAuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorPersonId" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(60) NOT NULL,
    "targetId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessOperationMutation_organizationId_idempotencyKey_key" ON "BusinessOperationMutation"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BusinessOperationMutation_organizationId_action_createdAt_idx" ON "BusinessOperationMutation"("organizationId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOperationMutation_targetType_targetId_idx" ON "BusinessOperationMutation"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "BusinessOperationMutation_actorMembershipId_createdAt_idx" ON "BusinessOperationMutation"("actorMembershipId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessAuditLog_organizationId_createdAt_idx" ON "BusinessAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessAuditLog_organizationId_action_createdAt_idx" ON "BusinessAuditLog"("organizationId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessAuditLog_targetType_targetId_idx" ON "BusinessAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "BusinessAuditLog_actorMembershipId_createdAt_idx" ON "BusinessAuditLog"("actorMembershipId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessOperationMutation" ADD CONSTRAINT "BusinessOperationMutation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessOperationMutation" ADD CONSTRAINT "BusinessOperationMutation_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAuditLog" ADD CONSTRAINT "BusinessAuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAuditLog" ADD CONSTRAINT "BusinessAuditLog_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAuditLog" ADD CONSTRAINT "BusinessAuditLog_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
