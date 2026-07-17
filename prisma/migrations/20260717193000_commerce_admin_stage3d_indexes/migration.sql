-- Stage 3D global Admin cursor indexes. Existing migrations remain immutable.
CREATE INDEX "MarketplaceCategory_updatedAt_id_idx"
  ON "MarketplaceCategory"("updatedAt", "id");

CREATE INDEX "Product_status_updatedAt_id_idx"
  ON "Product"("status", "updatedAt", "id");

CREATE INDEX "Product_categoryId_status_updatedAt_id_idx"
  ON "Product"("categoryId", "status", "updatedAt", "id");

CREATE INDEX "Order_status_updatedAt_id_idx"
  ON "Order"("status", "updatedAt", "id");

CREATE INDEX "AdminAuditLog_createdAt_id_idx"
  ON "AdminAuditLog"("createdAt", "id");

CREATE INDEX "AdminAuditLog_targetType_targetId_createdAt_id_idx"
  ON "AdminAuditLog"("targetType", "targetId", "createdAt", "id");
