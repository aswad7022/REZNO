-- CreateTable
CREATE TABLE "CustomerFavoriteBusiness" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavoriteBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerFavoriteBusiness_customerId_createdAt_idx" ON "CustomerFavoriteBusiness"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFavoriteBusiness_organizationId_idx" ON "CustomerFavoriteBusiness"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFavoriteBusiness_customerId_organizationId_key" ON "CustomerFavoriteBusiness"("customerId", "organizationId");

-- AddForeignKey
ALTER TABLE "CustomerFavoriteBusiness" ADD CONSTRAINT "CustomerFavoriteBusiness_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteBusiness" ADD CONSTRAINT "CustomerFavoriteBusiness_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
