-- Gate 3C evidence-backed deterministic Order queue, expiration and history indexes.
-- Real staging plans on migration 32 required explicit Sort nodes because the
-- cursor tie-break columns were absent from every available index.
DROP INDEX "Order_status_reservationExpiresAt_idx";

CREATE INDEX "Order_storeId_status_reservationExpiresAt_id_idx"
ON "Order"("storeId", "status", "reservationExpiresAt", "id");

CREATE INDEX "Order_storeId_status_updatedAt_id_idx"
ON "Order"("storeId", "status", "updatedAt", "id");

CREATE INDEX "Order_status_reservationExpiresAt_id_idx"
ON "Order"("status", "reservationExpiresAt", "id");

DROP INDEX "OrderStatusHistory_orderId_createdAt_idx";

CREATE INDEX "OrderStatusHistory_orderId_createdAt_id_idx"
ON "OrderStatusHistory"("orderId", "createdAt", "id");
