-- Gate 2B persists mutation identity and the booking version used to create a
-- customer change request. Nullable fields keep existing web-created records
-- and historical bookings valid.
ALTER TABLE "Booking"
ADD COLUMN "customerCancellationIdempotencyKey" UUID,
ADD COLUMN "customerCancellationRequestHash" VARCHAR(64);

ALTER TABLE "BookingChangeRequest"
ADD COLUMN "creationIdempotencyKey" UUID,
ADD COLUMN "creationRequestHash" VARCHAR(64),
ADD COLUMN "bookingUpdatedAtSnapshot" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "Booking_customerId_customerCancellationIdempotencyKey_key"
ON "Booking"("customerId", "customerCancellationIdempotencyKey");

CREATE UNIQUE INDEX "BookingChangeRequest_requester_creationKey_key"
ON "BookingChangeRequest"("requestedByPersonId", "creationIdempotencyKey");
