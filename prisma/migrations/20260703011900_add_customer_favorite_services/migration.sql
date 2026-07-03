-- CreateTable
CREATE TABLE "CustomerFavoriteService" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchServiceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavoriteService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerFavoriteService_customerId_createdAt_idx" ON "CustomerFavoriteService"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFavoriteService_branchServiceId_idx" ON "CustomerFavoriteService"("branchServiceId");

-- CreateIndex
CREATE INDEX "CustomerFavoriteService_organizationId_idx" ON "CustomerFavoriteService"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFavoriteService_customerId_branchServiceId_key" ON "CustomerFavoriteService"("customerId", "branchServiceId");

-- AddForeignKey
ALTER TABLE "CustomerFavoriteService" ADD CONSTRAINT "CustomerFavoriteService_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteService" ADD CONSTRAINT "CustomerFavoriteService_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteService" ADD CONSTRAINT "CustomerFavoriteService_branchServiceId_fkey" FOREIGN KEY ("branchServiceId") REFERENCES "BranchService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
