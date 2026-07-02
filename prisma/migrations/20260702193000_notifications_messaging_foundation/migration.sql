CREATE TYPE "NotificationAudience" AS ENUM ('ALL', 'CUSTOMERS', 'BUSINESS_OWNERS', 'RESTAURANTS', 'BUSINESS', 'USER');

CREATE TYPE "NotificationPriority" AS ENUM ('NORMAL', 'IMPORTANT');

CREATE TYPE "ConversationType" AS ENUM ('CUSTOMER_BUSINESS', 'ADMIN_USER', 'ADMIN_BUSINESS');

CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" "NotificationAudience" NOT NULL,
  "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "recipientPersonId" UUID,
  "businessId" UUID,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "ConversationType" NOT NULL,
  "businessId" UUID,
  "customerId" UUID,
  "adminUserId" TEXT,
  "subject" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(6),

  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_audience_createdAt_idx" ON "Notification"("audience", "createdAt");
CREATE INDEX "Notification_recipientPersonId_createdAt_idx" ON "Notification"("recipientPersonId", "createdAt");
CREATE INDEX "Notification_businessId_createdAt_idx" ON "Notification"("businessId", "createdAt");

CREATE INDEX "Conversation_type_updatedAt_idx" ON "Conversation"("type", "updatedAt");
CREATE INDEX "Conversation_businessId_updatedAt_idx" ON "Conversation"("businessId", "updatedAt");
CREATE INDEX "Conversation_customerId_updatedAt_idx" ON "Conversation"("customerId", "updatedAt");
CREATE INDEX "Conversation_adminUserId_updatedAt_idx" ON "Conversation"("adminUserId", "updatedAt");

CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_senderUserId_createdAt_idx" ON "Message"("senderUserId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
