-- Restaurant reservations are a first-class domain and must not manufacture a
-- generic service offering merely to satisfy Booking persistence.
ALTER TABLE "Booking"
ALTER COLUMN "branchServiceId" DROP NOT NULL;

-- A normalized preorder may contain each menu item at most once.
CREATE UNIQUE INDEX "RestaurantReservationItem_restaurantReservationDetailsId_menuItemId_key"
ON "RestaurantReservationItem"("restaurantReservationDetailsId", "menuItemId");
