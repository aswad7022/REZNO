-- CreateEnum
CREATE TYPE "CommercePermission" AS ENUM ('STORE_VIEW', 'STORE_MANAGE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_ARCHIVE', 'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'ORDER_VIEW', 'ORDER_MANAGE', 'ORDER_CANCEL', 'REPORTS_VIEW');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketplaceCategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductVariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RESERVE', 'RELEASE', 'CONSUME', 'RESTOCK', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CheckoutIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CommerceOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('UNFULFILLED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'DELIVERY_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY', 'PAY_AT_PICKUP');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('STORE_DELIVERY', 'CUSTOMER_PICKUP');

-- CreateEnum
CREATE TYPE "OrderActorType" AS ENUM ('CUSTOMER', 'MERCHANT', 'ADMIN', 'SYSTEM');

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "commercePermissions" "CommercePermission"[] DEFAULT ARRAY[]::"CommercePermission"[];

-- Existing Organization owners receive only the approved commerce permission set.
-- All other roles retain the fail-closed empty default.
UPDATE "Role"
SET "commercePermissions" = ARRAY[
  'STORE_VIEW',
  'STORE_MANAGE',
  'PRODUCT_VIEW',
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'PRODUCT_ARCHIVE',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'ORDER_VIEW',
  'ORDER_MANAGE',
  'ORDER_CANCEL',
  'REPORTS_VIEW'
]::"CommercePermission"[]
WHERE "systemRole" = 'OWNER';

ALTER TABLE "Role" ALTER COLUMN "commercePermissions" SET NOT NULL;

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "supportPhone" TEXT,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "deliveryFee" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "minimumOrderValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "preparationEstimateMinutes" INTEGER,
    "deliveryEstimateMinutes" INTEGER,
    "deliveryCity" TEXT,
    "deliveryArea" TEXT,
    "pickupCity" TEXT,
    "pickupArea" TEXT,
    "pickupStreet" TEXT,
    "pickupAdditionalDetails" TEXT,
    "pickupInstructions" TEXT,
    "reviewReason" TEXT,
    "suspensionReason" TEXT,
    "archiveReason" TEXT,
    "submittedAt" TIMESTAMPTZ(6),
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "suspendedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCategory" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" "MarketplaceCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MarketplaceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedSearchText" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "suspensionReason" TEXT,
    "suspendedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "optionValues" JSONB NOT NULL DEFAULT '{}',
    "optionKey" TEXT NOT NULL,
    "price" DECIMAL(18,3) NOT NULL,
    "compareAtPrice" DECIMAL(18,3),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "status" "ProductVariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "url" TEXT NOT NULL,
    "mediaType" "ProductMediaType" NOT NULL DEFAULT 'IMAGE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "deterministicKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "releasedAt" TIMESTAMPTZ(6),
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "orderId" UUID,
    "reservationId" UUID,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "onHandDelta" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL,
    "resultingOnHand" INTEGER NOT NULL,
    "resultingReserved" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorType" "OrderActorType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "label" TEXT,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "additionalDetails" TEXT NOT NULL,
    "landmark" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutIdempotency" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "CheckoutIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "orderId" UUID,
    "responseData" JSONB,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CheckoutIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "status" "CommerceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "fulfillmentMethod" "FulfillmentMethod" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "subtotal" DECIMAL(18,3) NOT NULL,
    "discountTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,3) NOT NULL,
    "storeNameSnapshot" TEXT NOT NULL,
    "storeSlugSnapshot" TEXT NOT NULL,
    "storeLogoUrlSnapshot" TEXT,
    "storePhoneSnapshot" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerPhoneSnapshot" TEXT NOT NULL,
    "pickupAddressSnapshot" TEXT,
    "pickupInstructionsSnapshot" TEXT,
    "preparationEstimateMinutes" INTEGER,
    "deliveryEstimateMinutes" INTEGER,
    "customerInstructions" TEXT,
    "reservationExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancellationReason" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID,
    "productVariantId" UUID,
    "productNameSnapshot" TEXT NOT NULL,
    "variantTitleSnapshot" TEXT NOT NULL,
    "optionValuesSnapshot" JSONB NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "imageUrlSnapshot" TEXT,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "compareAtPrice" DECIMAL(18,3),
    "quantity" INTEGER NOT NULL,
    "lineSubtotal" DECIMAL(18,3) NOT NULL,
    "lineDiscount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAddress" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "additionalDetails" TEXT NOT NULL,
    "landmark" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "previousOrderStatus" "CommerceOrderStatus",
    "newOrderStatus" "CommerceOrderStatus",
    "previousFulfillmentStatus" "FulfillmentStatus",
    "newFulfillmentStatus" "FulfillmentStatus",
    "previousPaymentStatus" "PaymentStatus",
    "newPaymentStatus" "PaymentStatus",
    "actorType" "OrderActorType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amount" DECIMAL(18,3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "paidAt" TIMESTAMPTZ(6),
    "voidedAt" TIMESTAMPTZ(6),
    "recordedByType" "OrderActorType",
    "recordedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFavoriteStore" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavoriteStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFavoriteProduct" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavoriteProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_organizationId_key" ON "Store"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Store_organizationId_status_idx" ON "Store"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Store_status_publishedAt_idx" ON "Store"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceCategory_slug_key" ON "MarketplaceCategory"("slug");

-- CreateIndex
CREATE INDEX "MarketplaceCategory_status_displayOrder_idx" ON "MarketplaceCategory"("status", "displayOrder");

-- CreateIndex
CREATE INDEX "MarketplaceCategory_normalizedName_idx" ON "MarketplaceCategory"("normalizedName");

-- CreateIndex
CREATE INDEX "Product_storeId_status_publishedAt_idx" ON "Product"("storeId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_publishedAt_idx" ON "Product"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Product_normalizedSearchText_idx" ON "Product"("normalizedSearchText");

-- CreateIndex
CREATE INDEX "Product_createdAt_id_idx" ON "Product"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_storeId_key" ON "Product"("id", "storeId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_status_idx" ON "ProductVariant"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductVariant_storeId_status_idx" ON "ProductVariant"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_storeId_sku_key" ON "ProductVariant"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_optionKey_key" ON "ProductVariant"("productId", "optionKey");

-- CreateIndex
CREATE INDEX "ProductMedia_variantId_idx" ON "ProductMedia"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMedia_productId_sortOrder_key" ON "ProductMedia"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_variantId_key" ON "InventoryItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_orderItemId_key" ON "InventoryReservation"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_deterministicKey_key" ON "InventoryReservation"("deterministicKey");

-- CreateIndex
CREATE INDEX "InventoryReservation_orderId_status_idx" ON "InventoryReservation"("orderId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_inventoryItemId_idx" ON "InventoryReservation"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_inventoryItemId_createdAt_idx" ON "StockMovement"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_createdAt_idx" ON "StockMovement"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_reservationId_idx" ON "StockMovement"("reservationId");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_archivedAt_updatedAt_idx" ON "CustomerAddress"("customerId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Cart_customerId_status_idx" ON "Cart"("customerId", "status");

-- CreateIndex
CREATE INDEX "Cart_status_expiresAt_idx" ON "Cart"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Cart_storeId_idx" ON "Cart"("storeId");

-- CreateIndex
CREATE INDEX "CartItem_productVariantId_idx" ON "CartItem"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productVariantId_key" ON "CartItem"("cartId", "productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotency_orderId_key" ON "CheckoutIdempotency"("orderId");

-- CreateIndex
CREATE INDEX "CheckoutIdempotency_status_createdAt_idx" ON "CheckoutIdempotency"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CheckoutIdempotency_expiresAt_idx" ON "CheckoutIdempotency"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotency_customerId_key_key" ON "CheckoutIdempotency"("customerId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_id_idx" ON "Order"("customerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_reservationExpiresAt_idx" ON "Order"("status", "reservationExpiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_productVariantId_idx" ON "OrderItem"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAddress_orderId_key" ON "OrderAddress"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusHistory_idempotencyKey_key" ON "OrderStatusHistory"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFavoriteStore_customerId_createdAt_idx" ON "CustomerFavoriteStore"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFavoriteStore_storeId_idx" ON "CustomerFavoriteStore"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFavoriteStore_customerId_storeId_key" ON "CustomerFavoriteStore"("customerId", "storeId");

-- CreateIndex
CREATE INDEX "CustomerFavoriteProduct_customerId_createdAt_idx" ON "CustomerFavoriteProduct"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFavoriteProduct_productId_idx" ON "CustomerFavoriteProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFavoriteProduct_customerId_productId_key" ON "CustomerFavoriteProduct"("customerId", "productId");

-- Partial uniqueness that Prisma schema syntax cannot currently express.
CREATE UNIQUE INDEX "Cart_one_active_per_customer_key"
ON "Cart"("customerId")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "CustomerAddress_one_default_per_customer_key"
ON "CustomerAddress"("customerId")
WHERE "isDefault" = true AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "ProductVariant_one_default_per_product_key"
ON "ProductVariant"("productId")
WHERE "isDefault" = true AND "status" <> 'ARCHIVED';

-- Commerce invariants. IQD remains whole-value in Milestone 2A while the
-- Decimal(18,3) columns preserve future schema compatibility.
ALTER TABLE "Store"
  ADD CONSTRAINT "Store_currency_iqd_check" CHECK ("currency" = 'IQD'),
  ADD CONSTRAINT "Store_money_nonnegative_check" CHECK (
    "deliveryFee" >= 0 AND "minimumOrderValue" >= 0
  ),
  ADD CONSTRAINT "Store_money_whole_iqd_check" CHECK (
    "deliveryFee" = trunc("deliveryFee") AND
    "minimumOrderValue" = trunc("minimumOrderValue")
  ),
  ADD CONSTRAINT "Store_estimates_positive_check" CHECK (
    ("preparationEstimateMinutes" IS NULL OR "preparationEstimateMinutes" > 0) AND
    ("deliveryEstimateMinutes" IS NULL OR "deliveryEstimateMinutes" > 0)
  );

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_currency_iqd_check" CHECK ("currency" = 'IQD'),
  ADD CONSTRAINT "ProductVariant_price_positive_check" CHECK ("price" > 0),
  ADD CONSTRAINT "ProductVariant_price_whole_iqd_check" CHECK (
    "price" = trunc("price") AND
    ("compareAtPrice" IS NULL OR "compareAtPrice" = trunc("compareAtPrice"))
  ),
  ADD CONSTRAINT "ProductVariant_compare_price_check" CHECK (
    "compareAtPrice" IS NULL OR "compareAtPrice" > "price"
  );

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_nonnegative_check" CHECK (
    "onHand" >= 0 AND "reserved" >= 0 AND "version" >= 0 AND
    ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0)
  ),
  ADD CONSTRAINT "InventoryItem_reserved_lte_on_hand_check" CHECK ("reserved" <= "onHand");

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "StockMovement_result_nonnegative_check" CHECK (
    "resultingOnHand" >= 0 AND "resultingReserved" >= 0 AND
    "resultingReserved" <= "resultingOnHand"
  );

ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_latitude_check" CHECK (
    "latitude" IS NULL OR "latitude" BETWEEN -90 AND 90
  ),
  ADD CONSTRAINT "CustomerAddress_longitude_check" CHECK (
    "longitude" IS NULL OR "longitude" BETWEEN -180 AND 180
  );

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_currency_iqd_check" CHECK ("currency" = 'IQD'),
  ADD CONSTRAINT "Cart_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99),
  ADD CONSTRAINT "CartItem_price_whole_iqd_check" CHECK (
    "unitPriceSnapshot" > 0 AND "unitPriceSnapshot" = trunc("unitPriceSnapshot")
  );

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_currency_iqd_check" CHECK ("currency" = 'IQD'),
  ADD CONSTRAINT "Order_money_nonnegative_check" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "deliveryFee" >= 0 AND
    "taxTotal" = 0 AND "grandTotal" >= 0 AND "discountTotal" <= "subtotal"
  ),
  ADD CONSTRAINT "Order_money_whole_iqd_check" CHECK (
    "subtotal" = trunc("subtotal") AND
    "discountTotal" = trunc("discountTotal") AND
    "deliveryFee" = trunc("deliveryFee") AND
    "taxTotal" = trunc("taxTotal") AND
    "grandTotal" = trunc("grandTotal")
  ),
  ADD CONSTRAINT "Order_total_equation_check" CHECK (
    "grandTotal" = "subtotal" - "discountTotal" + "deliveryFee" + "taxTotal"
  ),
  ADD CONSTRAINT "Order_offline_method_check" CHECK (
    ("fulfillmentMethod" = 'STORE_DELIVERY' AND "paymentMethod" = 'CASH_ON_DELIVERY') OR
    ("fulfillmentMethod" = 'CUSTOMER_PICKUP' AND "paymentMethod" = 'PAY_AT_PICKUP')
  );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_currency_iqd_check" CHECK ("currency" = 'IQD'),
  ADD CONSTRAINT "OrderItem_money_whole_iqd_check" CHECK (
    "unitPrice" > 0 AND "unitPrice" = trunc("unitPrice") AND
    ("compareAtPrice" IS NULL OR "compareAtPrice" = trunc("compareAtPrice")) AND
    "lineSubtotal" = trunc("lineSubtotal") AND
    "lineDiscount" = trunc("lineDiscount") AND
    "lineTotal" = trunc("lineTotal")
  ),
  ADD CONSTRAINT "OrderItem_money_equation_check" CHECK (
    "lineSubtotal" >= 0 AND "lineDiscount" >= 0 AND
    "lineTotal" = "lineSubtotal" - "lineDiscount" AND
    "lineSubtotal" = COALESCE("compareAtPrice", "unitPrice") * "quantity" AND
    "lineTotal" = "unitPrice" * "quantity"
  );

ALTER TABLE "OrderAddress"
  ADD CONSTRAINT "OrderAddress_latitude_check" CHECK (
    "latitude" IS NULL OR "latitude" BETWEEN -90 AND 90
  ),
  ADD CONSTRAINT "OrderAddress_longitude_check" CHECK (
    "longitude" IS NULL OR "longitude" BETWEEN -180 AND 180
  );

ALTER TABLE "OrderStatusHistory"
  ADD CONSTRAINT "OrderStatusHistory_changed_dimension_check" CHECK (
    "newOrderStatus" IS NOT NULL OR
    "newFulfillmentStatus" IS NOT NULL OR
    "newPaymentStatus" IS NOT NULL
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_currency_iqd_check" CHECK ("currency" = 'IQD'),
  ADD CONSTRAINT "Payment_amount_whole_iqd_check" CHECK (
    "amount" >= 0 AND "amount" = trunc("amount")
  );

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarketplaceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_storeId_fkey" FOREIGN KEY ("productId", "storeId") REFERENCES "Product"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutIdempotency" ADD CONSTRAINT "CheckoutIdempotency_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutIdempotency" ADD CONSTRAINT "CheckoutIdempotency_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAddress" ADD CONSTRAINT "OrderAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteStore" ADD CONSTRAINT "CustomerFavoriteStore_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteStore" ADD CONSTRAINT "CustomerFavoriteStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteProduct" ADD CONSTRAINT "CustomerFavoriteProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavoriteProduct" ADD CONSTRAINT "CustomerFavoriteProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
