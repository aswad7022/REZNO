-- Gate 2A stores the mobile request identity on the created booking itself.
-- Existing web and restaurant bookings remain valid because both columns are nullable.
ALTER TABLE "Booking"
ADD COLUMN "creationIdempotencyKey" UUID,
ADD COLUMN "creationRequestHash" VARCHAR(64);

CREATE UNIQUE INDEX "Booking_customerId_creationIdempotencyKey_key"
ON "Booking"("customerId", "creationIdempotencyKey");
