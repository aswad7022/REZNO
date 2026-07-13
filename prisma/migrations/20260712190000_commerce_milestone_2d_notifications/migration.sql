ALTER TABLE "Notification"
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "metadata" JSONB;

CREATE UNIQUE INDEX "Notification_eventKey_key" ON "Notification"("eventKey");

ALTER TYPE "LanguageCode" ADD VALUE IF NOT EXISTS 'KU';
