-- CreateEnum
CREATE TYPE "MediaContainerKind" AS ENUM ('CUSTOMER_PROFILE', 'BUSINESS_PROFILE', 'SERVICE', 'STORE', 'PRODUCT', 'MENU_ITEM');

-- CreateEnum
CREATE TYPE "MediaSlot" AS ENUM ('CUSTOMER_AVATAR', 'BUSINESS_LOGO', 'BUSINESS_COVER', 'BUSINESS_GALLERY', 'SERVICE_PRIMARY', 'STORE_LOGO', 'STORE_COVER', 'PRODUCT_IMAGE', 'MENU_ITEM_PRIMARY');

-- CreateEnum
CREATE TYPE "MediaBindingState" AS ENUM ('ACTIVE', 'DETACHED');

-- CreateEnum
CREATE TYPE "MediaMutationAction" AS ENUM ('ATTACH_MEDIA', 'REPLACE_MEDIA', 'DETACH_MEDIA', 'REORDER_MEDIA', 'UPDATE_MEDIA_ALT', 'ADMIN_DETACH_REJECTED_MEDIA');

-- CreateTable
CREATE TABLE "MediaContainer" (
    "id" UUID NOT NULL,
    "kind" "MediaContainerKind" NOT NULL,
    "personId" UUID,
    "organizationId" UUID,
    "serviceId" UUID,
    "storeId" UUID,
    "productId" UUID,
    "menuItemId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MediaContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaBinding" (
    "id" UUID NOT NULL,
    "containerId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "slot" "MediaSlot" NOT NULL,
    "state" "MediaBindingState" NOT NULL DEFAULT 'ACTIVE',
    "productVariantId" UUID,
    "sortOrder" INTEGER,
    "altText" VARCHAR(300),
    "createdByPersonId" UUID NOT NULL,
    "detachedByPersonId" UUID,
    "attachedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detachedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MediaBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaMutation" (
    "id" UUID NOT NULL,
    "actorPersonId" UUID NOT NULL,
    "organizationId" UUID,
    "containerId" UUID,
    "action" "MediaMutationAction" NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "resultVersion" INTEGER,
    "status" "StorageMutationStatus" NOT NULL DEFAULT 'PROCESSING',
    "result" JSONB,
    "failureCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MediaMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaContainer_organizationId_kind_updatedAt_id_idx" ON "MediaContainer"("organizationId", "kind", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MediaContainer_kind_updatedAt_id_idx" ON "MediaContainer"("kind", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MediaBinding_containerId_state_slot_sortOrder_id_idx" ON "MediaBinding"("containerId", "state", "slot", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "MediaBinding_containerId_slot_createdAt_id_idx" ON "MediaBinding"("containerId", "slot", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MediaBinding_assetId_state_idx" ON "MediaBinding"("assetId", "state");

-- CreateIndex
CREATE INDEX "MediaBinding_productVariantId_state_idx" ON "MediaBinding"("productVariantId", "state");

-- CreateIndex
CREATE INDEX "MediaMutation_containerId_createdAt_id_idx" ON "MediaMutation"("containerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MediaMutation_organizationId_createdAt_id_idx" ON "MediaMutation"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MediaMutation_status_createdAt_id_idx" ON "MediaMutation"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MediaMutation_actorPersonId_idempotencyKey_key" ON "MediaMutation"("actorPersonId", "idempotencyKey");

-- Typed-container and lifecycle constraints
ALTER TABLE "MediaContainer"
  ADD CONSTRAINT "MediaContainer_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "MediaContainer_typed_target_check" CHECK (
    ("kind" = 'CUSTOMER_PROFILE' AND "personId" IS NOT NULL AND "organizationId" IS NULL AND "serviceId" IS NULL AND "storeId" IS NULL AND "productId" IS NULL AND "menuItemId" IS NULL)
    OR ("kind" = 'BUSINESS_PROFILE' AND "personId" IS NULL AND "organizationId" IS NOT NULL AND "serviceId" IS NULL AND "storeId" IS NULL AND "productId" IS NULL AND "menuItemId" IS NULL)
    OR ("kind" = 'SERVICE' AND "personId" IS NULL AND "organizationId" IS NOT NULL AND "serviceId" IS NOT NULL AND "storeId" IS NULL AND "productId" IS NULL AND "menuItemId" IS NULL)
    OR ("kind" = 'STORE' AND "personId" IS NULL AND "organizationId" IS NOT NULL AND "serviceId" IS NULL AND "storeId" IS NOT NULL AND "productId" IS NULL AND "menuItemId" IS NULL)
    OR ("kind" = 'PRODUCT' AND "personId" IS NULL AND "organizationId" IS NOT NULL AND "serviceId" IS NULL AND "storeId" IS NULL AND "productId" IS NOT NULL AND "menuItemId" IS NULL)
    OR ("kind" = 'MENU_ITEM' AND "personId" IS NULL AND "organizationId" IS NOT NULL AND "serviceId" IS NULL AND "storeId" IS NULL AND "productId" IS NULL AND "menuItemId" IS NOT NULL)
  );

ALTER TABLE "MediaBinding"
  ADD CONSTRAINT "MediaBinding_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "MediaBinding_alt_text_check" CHECK (
    "altText" IS NULL OR (char_length("altText") <= 300 AND "altText" !~ '[[:cntrl:]]')
  ),
  ADD CONSTRAINT "MediaBinding_state_timestamps_check" CHECK (
    ("state" = 'ACTIVE' AND "detachedAt" IS NULL AND "detachedByPersonId" IS NULL)
    OR ("state" = 'DETACHED' AND "detachedAt" IS NOT NULL AND "detachedByPersonId" IS NOT NULL AND "detachedAt" >= "attachedAt")
  ),
  ADD CONSTRAINT "MediaBinding_slot_shape_check" CHECK (
    ("slot" IN ('CUSTOMER_AVATAR', 'BUSINESS_LOGO', 'BUSINESS_COVER', 'SERVICE_PRIMARY', 'STORE_LOGO', 'STORE_COVER', 'MENU_ITEM_PRIMARY') AND "sortOrder" IS NULL AND "productVariantId" IS NULL)
    OR ("slot" = 'BUSINESS_GALLERY' AND "sortOrder" BETWEEN 0 AND 23 AND "productVariantId" IS NULL)
    OR ("slot" = 'PRODUCT_IMAGE' AND "sortOrder" BETWEEN 0 AND 11)
  );

ALTER TABLE "MediaMutation"
  ADD CONSTRAINT "MediaMutation_expected_version_check" CHECK ("expectedVersion" >= 0),
  ADD CONSTRAINT "MediaMutation_result_version_check" CHECK ("resultVersion" IS NULL OR "resultVersion" > 0),
  ADD CONSTRAINT "MediaMutation_request_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "MediaMutation_status_result_check" CHECK (
    ("status" = 'PROCESSING' AND "resultVersion" IS NULL AND "result" IS NULL)
    OR ("status" = 'COMPLETED' AND "containerId" IS NOT NULL AND "resultVersion" IS NOT NULL AND "result" IS NOT NULL AND "failureCode" IS NULL)
    OR ("status" = 'FAILED' AND "failureCode" IS NOT NULL)
  );

-- One typed container per target.
CREATE UNIQUE INDEX "MediaContainer_customer_profile_target_key"
  ON "MediaContainer"("personId") WHERE "kind" = 'CUSTOMER_PROFILE';
CREATE UNIQUE INDEX "MediaContainer_business_profile_target_key"
  ON "MediaContainer"("organizationId") WHERE "kind" = 'BUSINESS_PROFILE';
CREATE UNIQUE INDEX "MediaContainer_service_target_key"
  ON "MediaContainer"("serviceId") WHERE "kind" = 'SERVICE';
CREATE UNIQUE INDEX "MediaContainer_store_target_key"
  ON "MediaContainer"("storeId") WHERE "kind" = 'STORE';
CREATE UNIQUE INDEX "MediaContainer_product_target_key"
  ON "MediaContainer"("productId") WHERE "kind" = 'PRODUCT';
CREATE UNIQUE INDEX "MediaContainer_menu_item_target_key"
  ON "MediaContainer"("menuItemId") WHERE "kind" = 'MENU_ITEM';

-- Current binding uniqueness without deleting detached history.
CREATE UNIQUE INDEX "MediaBinding_active_asset_key"
  ON "MediaBinding"("assetId") WHERE "state" = 'ACTIVE';
CREATE UNIQUE INDEX "MediaBinding_active_singleton_slot_key"
  ON "MediaBinding"("containerId", "slot")
  WHERE "state" = 'ACTIVE' AND "slot" IN ('CUSTOMER_AVATAR', 'BUSINESS_LOGO', 'BUSINESS_COVER', 'SERVICE_PRIMARY', 'STORE_LOGO', 'STORE_COVER', 'MENU_ITEM_PRIMARY');
CREATE UNIQUE INDEX "MediaBinding_active_collection_order_key"
  ON "MediaBinding"("containerId", "slot", "sortOrder")
  WHERE "state" = 'ACTIVE' AND "slot" IN ('BUSINESS_GALLERY', 'PRODUCT_IMAGE');

-- Cross-table scope invariants cannot be expressed as CHECK constraints.
-- Keep direct SQL and future writers inside the same typed tenant boundary as
-- the canonical application service.
CREATE FUNCTION "rezno_validate_media_container_scope"() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" = 'SERVICE' AND NOT EXISTS (
    SELECT 1 FROM "Service"
    WHERE "id" = NEW."serviceId" AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'media container service scope mismatch' USING ERRCODE = '23514';
  ELSIF NEW."kind" = 'STORE' AND NOT EXISTS (
    SELECT 1 FROM "Store"
    WHERE "id" = NEW."storeId" AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'media container store scope mismatch' USING ERRCODE = '23514';
  ELSIF NEW."kind" = 'PRODUCT' AND NOT EXISTS (
    SELECT 1
    FROM "Product" AS product
    JOIN "Store" AS store ON store."id" = product."storeId"
    WHERE product."id" = NEW."productId" AND store."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'media container product scope mismatch' USING ERRCODE = '23514';
  ELSIF NEW."kind" = 'MENU_ITEM' AND NOT EXISTS (
    SELECT 1 FROM "MenuItem"
    WHERE "id" = NEW."menuItemId" AND "businessId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'media container menu-item scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MediaContainer_scope_guard"
  BEFORE INSERT OR UPDATE OF "kind", "organizationId", "serviceId", "storeId", "productId", "menuItemId"
  ON "MediaContainer"
  FOR EACH ROW EXECUTE FUNCTION "rezno_validate_media_container_scope"();

CREATE FUNCTION "rezno_validate_media_binding_scope"() RETURNS trigger AS $$
DECLARE
  target "MediaContainer"%ROWTYPE;
  stored "StoredAsset"%ROWTYPE;
BEGIN
  SELECT * INTO target FROM "MediaContainer" WHERE "id" = NEW."containerId";
  SELECT * INTO stored FROM "StoredAsset" WHERE "id" = NEW."assetId";
  IF target."id" IS NULL OR stored."id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (NEW."slot" = 'CUSTOMER_AVATAR' AND target."kind" = 'CUSTOMER_PROFILE' AND stored."purpose" = 'CUSTOMER_AVATAR' AND stored."visibility" = 'PRIVATE' AND stored."ownerPersonId" = target."personId" AND stored."organizationId" IS NULL)
    OR (NEW."slot" = 'BUSINESS_LOGO' AND target."kind" = 'BUSINESS_PROFILE' AND stored."purpose" = 'BUSINESS_LOGO' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'BUSINESS_COVER' AND target."kind" = 'BUSINESS_PROFILE' AND stored."purpose" = 'BUSINESS_COVER' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'BUSINESS_GALLERY' AND target."kind" = 'BUSINESS_PROFILE' AND stored."purpose" = 'BUSINESS_GALLERY_IMAGE' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'SERVICE_PRIMARY' AND target."kind" = 'SERVICE' AND stored."purpose" = 'SERVICE_IMAGE' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'STORE_LOGO' AND target."kind" = 'STORE' AND stored."purpose" = 'STORE_LOGO' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'STORE_COVER' AND target."kind" = 'STORE' AND stored."purpose" = 'STORE_COVER' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'PRODUCT_IMAGE' AND target."kind" = 'PRODUCT' AND stored."purpose" = 'PRODUCT_IMAGE' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
    OR (NEW."slot" = 'MENU_ITEM_PRIMARY' AND target."kind" = 'MENU_ITEM' AND stored."purpose" = 'RESTAURANT_MENU_IMAGE' AND stored."visibility" = 'PUBLIC' AND stored."organizationId" = target."organizationId")
  ) THEN
    RAISE EXCEPTION 'media binding slot, purpose, visibility, or owner scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW."productVariantId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "ProductVariant" AS variant
    JOIN "Product" AS product ON product."id" = variant."productId" AND product."storeId" = variant."storeId"
    JOIN "Store" AS store ON store."id" = product."storeId"
    WHERE variant."id" = NEW."productVariantId"
      AND target."kind" = 'PRODUCT'
      AND variant."productId" = target."productId"
      AND store."organizationId" = target."organizationId"
  ) THEN
    RAISE EXCEPTION 'media binding product variant scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MediaBinding_scope_guard"
  BEFORE INSERT OR UPDATE OF "containerId", "assetId", "slot", "productVariantId"
  ON "MediaBinding"
  FOR EACH ROW EXECUTE FUNCTION "rezno_validate_media_binding_scope"();

-- AddForeignKey
ALTER TABLE "MediaContainer" ADD CONSTRAINT "MediaContainer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContainer" ADD CONSTRAINT "MediaContainer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContainer" ADD CONSTRAINT "MediaContainer_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContainer" ADD CONSTRAINT "MediaContainer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContainer" ADD CONSTRAINT "MediaContainer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaContainer" ADD CONSTRAINT "MediaContainer_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBinding" ADD CONSTRAINT "MediaBinding_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "MediaContainer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBinding" ADD CONSTRAINT "MediaBinding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StoredAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBinding" ADD CONSTRAINT "MediaBinding_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBinding" ADD CONSTRAINT "MediaBinding_createdByPersonId_fkey" FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBinding" ADD CONSTRAINT "MediaBinding_detachedByPersonId_fkey" FOREIGN KEY ("detachedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaMutation" ADD CONSTRAINT "MediaMutation_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaMutation" ADD CONSTRAINT "MediaMutation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaMutation" ADD CONSTRAINT "MediaMutation_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "MediaContainer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
