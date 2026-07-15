-- Gate 2E preserves preorder history and gives Restaurant management its own
-- immediate, replay-safe mutation ledger instead of reusing service change requests.
ALTER TABLE "RestaurantReservationItem"
ADD COLUMN "itemNameSnapshot" TEXT,
ADD COLUMN "currencySnapshot" VARCHAR(3);

UPDATE "RestaurantReservationItem" AS item
SET
  "itemNameSnapshot" = menu."name",
  "currencySnapshot" = menu."currency"
FROM "MenuItem" AS menu
WHERE menu."id" = item."menuItemId";

CREATE TYPE "RestaurantReservationMutationType" AS ENUM ('CANCELLATION', 'RESCHEDULE');

CREATE TABLE "RestaurantReservationMutation" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "type" "RestaurantReservationMutationType" NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "bookingUpdatedAtSnapshot" TIMESTAMPTZ(6) NOT NULL,
  "resultBookingUpdatedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestaurantReservationMutation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RestaurantReservationMutation"
ADD CONSTRAINT "RestaurantReservationMutation_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReservationMutation"
ADD CONSTRAINT "RestaurantReservationMutation_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Person"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RestaurantReservationMutation_customerId_idempotencyKey_key"
ON "RestaurantReservationMutation"("customerId", "idempotencyKey");

CREATE INDEX "RestaurantReservationMutation_bookingId_type_createdAt_idx"
ON "RestaurantReservationMutation"("bookingId", "type", "createdAt");
