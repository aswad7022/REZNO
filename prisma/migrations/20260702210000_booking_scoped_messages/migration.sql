ALTER TABLE "Conversation"
ADD COLUMN "bookingId" UUID;

CREATE INDEX "Conversation_bookingId_updatedAt_idx"
ON "Conversation"("bookingId", "updatedAt");

CREATE UNIQUE INDEX "Conversation_businessId_customerId_bookingId_key"
ON "Conversation"("businessId", "customerId", "bookingId");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
