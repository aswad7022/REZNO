CREATE INDEX "Organization_status_isActive_deletedAt_idx"
ON "Organization"("status", "isActive", "deletedAt");

CREATE INDEX "Service_organizationId_status_idx"
ON "Service"("organizationId", "status");

CREATE INDEX "BranchService_serviceId_isAvailable_idx"
ON "BranchService"("serviceId", "isAvailable");

CREATE INDEX "BranchService_isAvailable_idx"
ON "BranchService"("isAvailable");

CREATE INDEX "Branch_organizationId_status_deletedAt_idx"
ON "Branch"("organizationId", "status", "deletedAt");

CREATE INDEX "Branch_city_idx"
ON "Branch"("city");

CREATE INDEX "RestaurantReservationDetails_tableId_reservationDateTime_idx"
ON "RestaurantReservationDetails"("tableId", "reservationDateTime");
