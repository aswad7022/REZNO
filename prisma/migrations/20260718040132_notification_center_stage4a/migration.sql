-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('BOOKINGS', 'RESTAURANT', 'COMMERCE', 'MESSAGES', 'ACCOUNT', 'ADMIN_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('BOOKING', 'BOOKING_CHANGE_REQUEST', 'RESTAURANT_RESERVATION', 'COMMERCE_ORDER', 'STORE', 'PRODUCT', 'CONVERSATION', 'ADMIN_ANNOUNCEMENT', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "NotificationDestinationKind" AS ENUM ('NOTIFICATIONS', 'CUSTOMER_BOOKING', 'CUSTOMER_RESTAURANT', 'CUSTOMER_COMMERCE_ORDER', 'CUSTOMER_MESSAGES', 'CUSTOMER_ACCOUNT', 'BUSINESS_CALENDAR', 'BUSINESS_BOOKING', 'BUSINESS_RESTAURANT', 'BUSINESS_COMMERCE_ORDER', 'BUSINESS_MESSAGES', 'BUSINESS_NOTIFICATIONS', 'ADMIN_COMMERCE_STORES');

-- CreateEnum
CREATE TYPE "NotificationReadState" AS ENUM ('READ', 'UNREAD');

-- CreateEnum
CREATE TYPE "NotificationInteractionAction" AS ENUM ('MARK_READ', 'MARK_UNREAD', 'ARCHIVE', 'RESTORE', 'MARK_ALL_READ', 'UPDATE_PREFERENCES');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "bodyKey" VARCHAR(160),
ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'ADMIN_ANNOUNCEMENT',
ADD COLUMN     "destinationKind" "NotificationDestinationKind" NOT NULL DEFAULT 'NOTIFICATIONS',
ADD COLUMN     "destinationTargetId" UUID,
ADD COLUMN     "eventType" VARCHAR(100) NOT NULL DEFAULT 'legacy.notification',
ADD COLUMN     "expiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "localizationVariables" JSONB,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sourceId" UUID,
ADD COLUMN     "sourceType" "NotificationSourceType" NOT NULL DEFAULT 'ADMIN_ANNOUNCEMENT',
ADD COLUMN     "titleKey" VARCHAR(160);

-- Existing rows retain their original occurrence time and become deterministic,
-- canonical legacy events without rewriting any domain ledger.
UPDATE "Notification"
SET
  "occurredAt" = "createdAt",
  "eventKey" = COALESCE("eventKey", 'legacy-notification:' || "id"::text),
  "category" = CASE
    WHEN "eventKey" LIKE 'commerce:%' THEN 'COMMERCE'::"NotificationCategory"
    WHEN COALESCE("metadata"->>'eventType', "metadata"->>'event', '') LIKE 'restaurant.%' THEN 'RESTAURANT'::"NotificationCategory"
    WHEN COALESCE("metadata"->>'eventType', "metadata"->>'event', '') LIKE 'booking.%' THEN 'BOOKINGS'::"NotificationCategory"
    WHEN "title" IN ('رسالة جديدة من عميل', 'رسالة جديدة من النشاط') THEN 'MESSAGES'::"NotificationCategory"
    WHEN "title" = 'New review received' THEN 'BOOKINGS'::"NotificationCategory"
    ELSE 'ADMIN_ANNOUNCEMENT'::"NotificationCategory"
  END,
  "eventType" = LEFT(COALESCE(
    "metadata"->>'eventType',
    "metadata"->>'event',
    CASE
      WHEN "title" IN ('رسالة جديدة من عميل', 'رسالة جديدة من النشاط') THEN 'message.arrived'
      WHEN "title" = 'New review received' THEN 'review.created'
      WHEN "createdByUserId" IS NOT NULL THEN 'admin.announcement'
      ELSE 'legacy.notification'
    END
  ), 100),
  "sourceType" = CASE
    WHEN "eventKey" LIKE 'commerce:%' THEN 'COMMERCE_ORDER'::"NotificationSourceType"
    WHEN COALESCE("metadata"->>'eventType', "metadata"->>'event', '') LIKE 'restaurant.%' THEN 'RESTAURANT_RESERVATION'::"NotificationSourceType"
    WHEN COALESCE("metadata"->>'eventType', "metadata"->>'event', '') LIKE 'booking.%' THEN 'BOOKING'::"NotificationSourceType"
    WHEN "title" IN ('رسالة جديدة من عميل', 'رسالة جديدة من النشاط') THEN 'CONVERSATION'::"NotificationSourceType"
    ELSE 'ADMIN_ANNOUNCEMENT'::"NotificationSourceType"
  END,
  "sourceId" = CASE
    WHEN COALESCE("metadata"->>'orderId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ("metadata"->>'orderId')::uuid
    WHEN COALESCE("metadata"->>'bookingId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ("metadata"->>'bookingId')::uuid
    WHEN COALESCE("metadata"->>'storeId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ("metadata"->>'storeId')::uuid
    ELSE "id"
  END,
  "destinationKind" = CASE
    WHEN "metadata"->>'destination' LIKE '/business/commerce/orders/%' THEN 'BUSINESS_COMMERCE_ORDER'::"NotificationDestinationKind"
    WHEN "metadata"->>'orderDestination' LIKE '/customer/orders/%' THEN 'CUSTOMER_COMMERCE_ORDER'::"NotificationDestinationKind"
    WHEN "metadata"->>'destination' = '/business/commerce/store' THEN 'BUSINESS_NOTIFICATIONS'::"NotificationDestinationKind"
    WHEN "metadata"->>'destination' = '/admin/commerce/stores' THEN 'ADMIN_COMMERCE_STORES'::"NotificationDestinationKind"
    ELSE 'NOTIFICATIONS'::"NotificationDestinationKind"
  END,
  "destinationTargetId" = CASE
    WHEN COALESCE("metadata"->>'orderId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ("metadata"->>'orderId')::uuid
    WHEN COALESCE("metadata"->>'bookingId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ("metadata"->>'bookingId')::uuid
    ELSE NULL
  END,
  "mandatory" = "priority" = 'IMPORTANT';

-- CreateTable
CREATE TABLE "NotificationRecipientState" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "readState" "NotificationReadState",
    "readStateChangedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationRecipientState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationInboxState" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "scopeKey" VARCHAR(180) NOT NULL,
    "readThrough" TIMESTAMPTZ(6) NOT NULL,
    "readAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationInboxState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationInteraction" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "notificationId" UUID,
    "idempotencyKey" UUID NOT NULL,
    "action" "NotificationInteractionAction" NOT NULL,
    "scopeKey" VARCHAR(180) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "resultVersion" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "bookingsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "restaurantEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commerceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "messagesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adminAnnouncementsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferenceSuppression" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "disabledAt" TIMESTAMPTZ(6) NOT NULL,
    "enabledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreferenceSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationRecipientState_personId_archivedAt_notification_idx" ON "NotificationRecipientState"("personId", "archivedAt", "notificationId");

-- CreateIndex
CREATE INDEX "NotificationRecipientState_personId_updatedAt_idx" ON "NotificationRecipientState"("personId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipientState_notificationId_personId_key" ON "NotificationRecipientState"("notificationId", "personId");

-- CreateIndex
CREATE INDEX "NotificationInboxState_personId_readThrough_idx" ON "NotificationInboxState"("personId", "readThrough");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationInboxState_personId_scopeKey_key" ON "NotificationInboxState"("personId", "scopeKey");

-- CreateIndex
CREATE INDEX "NotificationInteraction_notificationId_personId_idx" ON "NotificationInteraction"("notificationId", "personId");

-- CreateIndex
CREATE INDEX "NotificationInteraction_personId_action_createdAt_idx" ON "NotificationInteraction"("personId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationInteraction_personId_idempotencyKey_key" ON "NotificationInteraction"("personId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_personId_key" ON "NotificationPreference"("personId");

-- CreateIndex
CREATE INDEX "NotificationPreferenceSuppression_personId_category_disable_idx" ON "NotificationPreferenceSuppression"("personId", "category", "disabledAt", "enabledAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_id_idx" ON "Notification"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_category_createdAt_id_idx" ON "Notification"("category", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_recipientPersonId_createdAt_id_idx" ON "Notification"("recipientPersonId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_businessId_audience_createdAt_id_idx" ON "Notification"("businessId", "audience", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "NotificationRecipientState" ADD CONSTRAINT "NotificationRecipientState_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipientState" ADD CONSTRAINT "NotificationRecipientState_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationInboxState" ADD CONSTRAINT "NotificationInboxState_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationInteraction" ADD CONSTRAINT "NotificationInteraction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationInteraction" ADD CONSTRAINT "NotificationInteraction_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferenceSuppression" ADD CONSTRAINT "NotificationPreferenceSuppression_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
