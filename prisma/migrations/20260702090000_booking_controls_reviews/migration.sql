-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "businessCategory" TEXT;

-- CreateEnum
CREATE TYPE "BookingChangeRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ServiceStaffAssignment" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingChangeRequest" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "requestedByPersonId" UUID NOT NULL,
    "proposedMemberId" UUID,
    "proposedStartsAt" TIMESTAMPTZ(6) NOT NULL,
    "proposedEndsAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "BookingChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(6),
    CONSTRAINT "BookingChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "memberId" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
    ,CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStaffAssignment_serviceId_memberId_key" ON "ServiceStaffAssignment"("serviceId", "memberId");
CREATE INDEX "ServiceStaffAssignment_memberId_idx" ON "ServiceStaffAssignment"("memberId");
CREATE INDEX "BookingChangeRequest_bookingId_status_idx" ON "BookingChangeRequest"("bookingId", "status");
CREATE INDEX "BookingChangeRequest_requestedByPersonId_idx" ON "BookingChangeRequest"("requestedByPersonId");
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");
CREATE INDEX "Review_organizationId_createdAt_idx" ON "Review"("organizationId", "createdAt");
CREATE INDEX "Review_serviceId_idx" ON "Review"("serviceId");
CREATE INDEX "Review_memberId_idx" ON "Review"("memberId");
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- AddForeignKey
ALTER TABLE "ServiceStaffAssignment" ADD CONSTRAINT "ServiceStaffAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceStaffAssignment" ADD CONSTRAINT "ServiceStaffAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingChangeRequest" ADD CONSTRAINT "BookingChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingChangeRequest" ADD CONSTRAINT "BookingChangeRequest_requestedByPersonId_fkey" FOREIGN KEY ("requestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingChangeRequest" ADD CONSTRAINT "BookingChangeRequest_proposedMemberId_fkey" FOREIGN KEY ("proposedMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
