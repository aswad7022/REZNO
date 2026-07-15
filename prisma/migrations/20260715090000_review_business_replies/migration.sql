-- Preserve every historical review while adding one tenant-scoped current business reply.
ALTER TABLE "Review"
ADD COLUMN "businessReply" TEXT,
ADD COLUMN "businessReplyAuthorId" UUID,
ADD COLUMN "businessRepliedAt" TIMESTAMPTZ(6);

ALTER TABLE "Review"
ADD CONSTRAINT "Review_businessReplyAuthorId_fkey"
FOREIGN KEY ("businessReplyAuthorId") REFERENCES "OrganizationMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Review_organizationId_businessRepliedAt_idx"
ON "Review"("organizationId", "businessRepliedAt");

CREATE INDEX "Review_businessReplyAuthorId_idx"
ON "Review"("businessReplyAuthorId");
