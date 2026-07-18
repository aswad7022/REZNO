ALTER TABLE "Conversation"
  ADD COLUMN "identityKey" VARCHAR(180),
  ADD COLUMN "lastMessageAt" TIMESTAMPTZ(6);

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "businessId", "customerId"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Conversation"
  WHERE "type" = 'CUSTOMER_BUSINESS' AND "bookingId" IS NULL
)
UPDATE "Conversation" AS conversation
SET "identityKey" = CASE
  WHEN ranked.position = 1 THEN
    'customer-business:general:' || conversation."businessId"::text || ':' || conversation."customerId"::text
  ELSE 'legacy:' || conversation."id"::text
END
FROM ranked
WHERE conversation."id" = ranked."id";

UPDATE "Conversation"
SET "identityKey" = 'customer-business:booking:' || "bookingId"::text
WHERE "type" = 'CUSTOMER_BUSINESS' AND "bookingId" IS NOT NULL;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "adminUserId", "customerId"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Conversation"
  WHERE "type" = 'ADMIN_USER'
)
UPDATE "Conversation" AS conversation
SET "identityKey" = CASE
  WHEN ranked.position = 1 THEN
    'admin-user:' || conversation."adminUserId" || ':' || conversation."customerId"::text
  ELSE 'legacy:' || conversation."id"::text
END
FROM ranked
WHERE conversation."id" = ranked."id";

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "adminUserId", "businessId"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Conversation"
  WHERE "type" = 'ADMIN_BUSINESS'
)
UPDATE "Conversation" AS conversation
SET "identityKey" = CASE
  WHEN ranked.position = 1 THEN
    'admin-business:' || conversation."adminUserId" || ':' || conversation."businessId"::text
  ELSE 'legacy:' || conversation."id"::text
END
FROM ranked
WHERE conversation."id" = ranked."id";

UPDATE "Conversation"
SET "identityKey" = 'legacy:' || "id"::text
WHERE "identityKey" IS NULL;

UPDATE "Conversation" AS conversation
SET "lastMessageAt" = COALESCE(
  (
    SELECT MAX(message."createdAt")
    FROM "Message" AS message
    WHERE message."conversationId" = conversation."id"
  ),
  conversation."createdAt"
);

ALTER TABLE "Conversation"
  ALTER COLUMN "identityKey" SET NOT NULL,
  ALTER COLUMN "identityKey" SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN "lastMessageAt" SET NOT NULL,
  ALTER COLUMN "lastMessageAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Message"
  ADD COLUMN "idempotencyKey" UUID,
  ADD COLUMN "requestHash" VARCHAR(64),
  ADD COLUMN "sourceAction" VARCHAR(40);

CREATE TABLE "ConversationReadState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "personId" UUID,
  "adminUserId" TEXT,
  "scopeKey" VARCHAR(180) NOT NULL,
  "lastReadMessageCreatedAt" TIMESTAMPTZ(6),
  "lastReadMessageId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationReadState_actor_check" CHECK (
    (("personId" IS NOT NULL)::integer + ("adminUserId" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "ConversationReadState_boundary_check" CHECK (
    ("lastReadMessageCreatedAt" IS NULL) = ("lastReadMessageId" IS NULL)
  )
);

DROP INDEX "Conversation_type_updatedAt_idx";
DROP INDEX "Conversation_businessId_updatedAt_idx";
DROP INDEX "Conversation_customerId_updatedAt_idx";
DROP INDEX "Conversation_adminUserId_updatedAt_idx";
DROP INDEX "Message_conversationId_createdAt_idx";

CREATE UNIQUE INDEX "Conversation_identityKey_key"
ON "Conversation"("identityKey");
CREATE INDEX "Conversation_type_lastMessageAt_id_idx"
ON "Conversation"("type", "lastMessageAt", "id");
CREATE INDEX "Conversation_businessId_lastMessageAt_id_idx"
ON "Conversation"("businessId", "lastMessageAt", "id");
CREATE INDEX "Conversation_customerId_lastMessageAt_id_idx"
ON "Conversation"("customerId", "lastMessageAt", "id");
CREATE INDEX "Conversation_adminUserId_lastMessageAt_id_idx"
ON "Conversation"("adminUserId", "lastMessageAt", "id");

CREATE UNIQUE INDEX "Message_senderUserId_idempotencyKey_key"
ON "Message"("senderUserId", "idempotencyKey");
CREATE INDEX "Message_conversationId_createdAt_id_idx"
ON "Message"("conversationId", "createdAt", "id");

CREATE UNIQUE INDEX "ConversationReadState_conversationId_scopeKey_key"
ON "ConversationReadState"("conversationId", "scopeKey");
CREATE INDEX "ConversationReadState_personId_scopeKey_conversationId_idx"
ON "ConversationReadState"("personId", "scopeKey", "conversationId");
CREATE INDEX "ConversationReadState_adminUserId_scopeKey_conversationId_idx"
ON "ConversationReadState"("adminUserId", "scopeKey", "conversationId");
CREATE INDEX "ConversationReadState_conversationId_lastReadMessageCreatedAt_lastReadMessageId_idx"
ON "ConversationReadState"("conversationId", "lastReadMessageCreatedAt", "lastReadMessageId");

ALTER TABLE "ConversationReadState"
ADD CONSTRAINT "ConversationReadState_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReadState"
ADD CONSTRAINT "ConversationReadState_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReadState"
ADD CONSTRAINT "ConversationReadState_adminUserId_fkey"
FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReadState"
ADD CONSTRAINT "ConversationReadState_lastReadMessageId_fkey"
FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
