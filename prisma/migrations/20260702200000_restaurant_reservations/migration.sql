CREATE TABLE "RestaurantReservationDetails" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "branchId" UUID,
  "tableId" UUID NOT NULL,
  "guestCount" INTEGER NOT NULL,
  "reservationDateTime" TIMESTAMPTZ(6) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 90,
  "seatingArea" TEXT,
  "customerNote" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RestaurantReservationDetails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantReservationItem" (
  "id" UUID NOT NULL,
  "restaurantReservationDetailsId" UUID NOT NULL,
  "menuItemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RestaurantReservationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantReservationDetails_bookingId_key"
ON "RestaurantReservationDetails"("bookingId");

CREATE INDEX "RestaurantReservationDetails_businessId_idx"
ON "RestaurantReservationDetails"("businessId");

CREATE INDEX "RestaurantReservationDetails_branchId_idx"
ON "RestaurantReservationDetails"("branchId");

CREATE INDEX "RestaurantReservationDetails_tableId_idx"
ON "RestaurantReservationDetails"("tableId");

CREATE INDEX "RestaurantReservationDetails_reservationDateTime_idx"
ON "RestaurantReservationDetails"("reservationDateTime");

CREATE INDEX "RestaurantReservationItem_restaurantReservationDetailsId_idx"
ON "RestaurantReservationItem"("restaurantReservationDetailsId");

CREATE INDEX "RestaurantReservationItem_menuItemId_idx"
ON "RestaurantReservationItem"("menuItemId");

ALTER TABLE "RestaurantReservationDetails"
ADD CONSTRAINT "RestaurantReservationDetails_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReservationDetails"
ADD CONSTRAINT "RestaurantReservationDetails_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReservationDetails"
ADD CONSTRAINT "RestaurantReservationDetails_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RestaurantReservationDetails"
ADD CONSTRAINT "RestaurantReservationDetails_tableId_fkey"
FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantReservationItem"
ADD CONSTRAINT "RestaurantReservationItem_restaurantReservationDetailsId_fkey"
FOREIGN KEY ("restaurantReservationDetailsId") REFERENCES "RestaurantReservationDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReservationItem"
ADD CONSTRAINT "RestaurantReservationItem_menuItemId_fkey"
FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
