-- Gate 3B preflight: never guess a Default Variant or alter ambiguous catalog data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProductVariant"
    WHERE "status" = 'ACTIVE' AND "archivedAt" IS NULL AND "isDefault" = true
    GROUP BY "productId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 3B migration requires at most one active Default Variant per Product';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Product" p
    WHERE EXISTS (
      SELECT 1
      FROM "ProductVariant" v
      WHERE v."productId" = p."id"
        AND v."status" = 'ACTIVE'
        AND v."archivedAt" IS NULL
    )
      AND NOT EXISTS (
        SELECT 1
        FROM "ProductVariant" v
        WHERE v."productId" = p."id"
          AND v."status" = 'ACTIVE'
          AND v."archivedAt" IS NULL
          AND v."isDefault" = true
      )
  ) THEN
    RAISE EXCEPTION 'Gate 3B migration refuses Products with active Variants and no active Default';
  END IF;
END $$;

-- The Milestone 2A index covered every non-ARCHIVED Default, including INACTIVE
-- Variants. Gate 3B owns the exact active aggregate invariant.
DROP INDEX "ProductVariant_one_default_per_product_key";

CREATE UNIQUE INDEX "ProductVariant_one_default_per_product_key"
ON "ProductVariant"("productId")
WHERE "isDefault" = true AND "status" = 'ACTIVE' AND "archivedAt" IS NULL;

-- Evidence-backed bounded cursor indexes. Live pre-migration plans required
-- explicit Sort nodes for each of these deterministic tie-break orders.
CREATE INDEX "Product_storeId_updatedAt_id_idx"
ON "Product"("storeId", "updatedAt", "id");

CREATE INDEX "InventoryItem_updatedAt_id_idx"
ON "InventoryItem"("updatedAt", "id");

DROP INDEX "StockMovement_inventoryItemId_createdAt_idx";

CREATE INDEX "StockMovement_inventoryItemId_createdAt_id_idx"
ON "StockMovement"("inventoryItemId", "createdAt", "id");
