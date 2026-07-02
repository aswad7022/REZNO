CREATE TYPE "BusinessVertical" AS ENUM (
  'BARBER',
  'BEAUTY',
  'CLINIC',
  'DENTIST',
  'SPA',
  'GYM',
  'CONSULTANT',
  'RESTAURANT',
  'CAFE',
  'OTHER'
);

ALTER TABLE "Organization"
ADD COLUMN "vertical" "BusinessVertical" NOT NULL DEFAULT 'OTHER';

CREATE INDEX "Organization_vertical_idx" ON "Organization"("vertical");

CREATE TABLE "RestaurantTable" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "branchId" UUID,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "capacity" INTEGER NOT NULL,
  "area" TEXT,
  "floor" TEXT,
  "positionLabel" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuCategory" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "menuCategoryId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IQD',
  "imageUrl" TEXT,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "preparationMinutes" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestaurantTable_businessId_idx" ON "RestaurantTable"("businessId");
CREATE INDEX "RestaurantTable_branchId_idx" ON "RestaurantTable"("branchId");
CREATE INDEX "RestaurantTable_isActive_idx" ON "RestaurantTable"("isActive");
CREATE INDEX "RestaurantTable_capacity_idx" ON "RestaurantTable"("capacity");

CREATE INDEX "MenuCategory_businessId_idx" ON "MenuCategory"("businessId");
CREATE INDEX "MenuCategory_isActive_idx" ON "MenuCategory"("isActive");
CREATE INDEX "MenuCategory_sortOrder_idx" ON "MenuCategory"("sortOrder");

CREATE INDEX "MenuItem_businessId_idx" ON "MenuItem"("businessId");
CREATE INDEX "MenuItem_menuCategoryId_idx" ON "MenuItem"("menuCategoryId");
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");

ALTER TABLE "RestaurantTable"
ADD CONSTRAINT "RestaurantTable_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantTable"
ADD CONSTRAINT "RestaurantTable_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MenuCategory"
ADD CONSTRAINT "MenuCategory_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuItem"
ADD CONSTRAINT "MenuItem_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuItem"
ADD CONSTRAINT "MenuItem_menuCategoryId_fkey"
FOREIGN KEY ("menuCategoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
