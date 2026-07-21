-- Gate 5C: provider-neutral payments and append-only financial integrity.
-- Existing Payment rows remain pre-ledger compatibility summaries. This
-- migration deliberately creates no historical intents or journals.

CREATE TYPE "PaymentProviderKind" AS ENUM ('NOT_CONFIGURED', 'DETERMINISTIC_TEST');
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'AUTHORIZED', 'PARTIALLY_CAPTURED', 'CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'CLAIMED', 'PROCESSING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PaymentProviderEventStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "PaymentRefundReason" AS ENUM ('CUSTOMER_REQUEST', 'MERCHANT_CANCELLATION', 'ADMIN_CORRECTION', 'DUPLICATE_PAYMENT', 'SERVICE_UNAVAILABLE', 'OTHER');
CREATE TYPE "PaymentActorType" AS ENUM ('CUSTOMER', 'MERCHANT', 'ADMIN', 'SYSTEM', 'PROVIDER');
CREATE TYPE "PaymentTargetType" AS ENUM ('ORDER', 'BOOKING');
CREATE TYPE "PaymentMutationAction" AS ENUM ('CREATE_INTENT', 'SUBMIT_ATTEMPT', 'RETRY_ATTEMPT', 'CANCEL_INTENT', 'CAPTURE', 'REQUEST_REFUND', 'RETRY_REFUND', 'PROCESS_PROVIDER_EVENT', 'PREVIEW_SETTLEMENT', 'FINALIZE_SETTLEMENT', 'RUN_RECONCILIATION', 'APPLY_CORRECTION');
CREATE TYPE "PaymentMutationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "FinancialAccountFamily" AS ENUM ('PROVIDER_CLEARING', 'MERCHANT_PAYABLE', 'PLATFORM_REVENUE', 'CUSTOMER_REFUND_CLEARING', 'SETTLEMENT_CLEARING', 'PAYMENT_EXCEPTION');
CREATE TYPE "FinancialJournalSource" AS ENUM ('CAPTURE', 'REFUND', 'SETTLEMENT', 'REVERSAL', 'RECONCILIATION');
CREATE TYPE "FinancialJournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE "FinancialPostingSide" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "SettlementBatchStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOID');

ALTER TYPE "CommercePermission" ADD VALUE 'PAYMENT_VIEW';
ALTER TYPE "CommercePermission" ADD VALUE 'PAYMENT_REFUND';
ALTER TYPE "CommercePermission" ADD VALUE 'SETTLEMENT_VIEW';
ALTER TYPE "NotificationCategory" ADD VALUE 'PAYMENTS';
ALTER TYPE "NotificationDestinationKind" ADD VALUE 'CUSTOMER_PAYMENT';
ALTER TYPE "NotificationDestinationKind" ADD VALUE 'BUSINESS_PAYMENTS';
ALTER TYPE "NotificationDestinationKind" ADD VALUE 'ADMIN_PAYMENTS';
ALTER TYPE "NotificationSourceType" ADD VALUE 'PAYMENT_INTENT';
ALTER TYPE "NotificationSourceType" ADD VALUE 'PAYMENT_REFUND';
ALTER TYPE "NotificationSourceType" ADD VALUE 'SETTLEMENT_BATCH';
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE_PROVIDER';

ALTER TABLE "Order" DROP CONSTRAINT "Order_offline_method_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_offline_method_check" CHECK (
  "paymentMethod"::text = 'ONLINE_PROVIDER' OR
  ("fulfillmentMethod" = 'STORE_DELIVERY' AND "paymentMethod" = 'CASH_ON_DELIVERY') OR
  ("fulfillmentMethod" = 'CUSTOMER_PICKUP' AND "paymentMethod" = 'PAY_AT_PICKUP')
);
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

ALTER TABLE "Booking"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD CONSTRAINT "Booking_payment_currency_iqd_check" CHECK ("currency" = 'IQD');

ALTER TABLE "Payment" ADD COLUMN "paymentIntentId" UUID;

CREATE TABLE "PaymentIntent" (
  "id" UUID NOT NULL,
  "orderId" UUID,
  "bookingId" UUID,
  "customerPersonId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "storeId" UUID,
  "provider" "PaymentProviderKind" NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "amount" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "capturedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "commissionBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "commissionAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "merchantNetAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "commissionPolicyId" VARCHAR(80) NOT NULL DEFAULT 'zero-v1',
  "providerReference" VARCHAR(180),
  "expiresAt" TIMESTAMPTZ(6),
  "authorizedAt" TIMESTAMPTZ(6),
  "capturedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "failedAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentIntent_exactly_one_target_check" CHECK (("orderId" IS NOT NULL)::integer + ("bookingId" IS NOT NULL)::integer = 1),
  CONSTRAINT "PaymentIntent_online_method_check" CHECK ("method" = 'ONLINE_PROVIDER'),
  CONSTRAINT "PaymentIntent_generation_check" CHECK ("generation" > 0),
  CONSTRAINT "PaymentIntent_version_check" CHECK ("version" > 0),
  CONSTRAINT "PaymentIntent_currency_check" CHECK ("currency" = 'IQD'),
  CONSTRAINT "PaymentIntent_amount_check" CHECK ("amount" > 0 AND "amount" = trunc("amount") AND "amount" <= 999999999999999.000),
  CONSTRAINT "PaymentIntent_capture_bounds_check" CHECK ("capturedAmount" >= 0 AND "capturedAmount" <= "amount" AND "capturedAmount" = trunc("capturedAmount")),
  CONSTRAINT "PaymentIntent_refund_bounds_check" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "capturedAmount" AND "refundedAmount" = trunc("refundedAmount")),
  CONSTRAINT "PaymentIntent_commission_bounds_check" CHECK ("commissionBasisPoints" BETWEEN 0 AND 10000 AND "commissionAmount" >= 0 AND "commissionAmount" <= "capturedAmount" AND "commissionAmount" = trunc("commissionAmount")),
  CONSTRAINT "PaymentIntent_net_equation_check" CHECK ("merchantNetAmount" = "capturedAmount" - "commissionAmount"),
  CONSTRAINT "PaymentIntent_terminal_timestamp_check" CHECK (
    ("status" NOT IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED') OR "capturedAt" IS NOT NULL) AND
    ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL) AND
    ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
  )
);

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL,
  "paymentIntentId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "provider" "PaymentProviderKind" NOT NULL,
  "providerRequestReference" VARCHAR(180) NOT NULL,
  "providerPaymentReference" VARCHAR(180),
  "idempotencyKey" UUID NOT NULL,
  "safeProviderCode" VARCHAR(80),
  "requiresAction" BOOLEAN NOT NULL DEFAULT false,
  "actionReference" VARCHAR(240),
  "actionExpiresAt" TIMESTAMPTZ(6),
  "claimedBy" VARCHAR(120),
  "claimExpiresAt" TIMESTAMPTZ(6),
  "startedAt" TIMESTAMPTZ(6),
  "finishedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_number_check" CHECK ("attemptNumber" BETWEEN 1 AND 5),
  CONSTRAINT "PaymentAttempt_action_check" CHECK (
    (NOT "requiresAction" AND "actionReference" IS NULL AND "actionExpiresAt" IS NULL) OR
    ("requiresAction" AND "actionReference" IS NOT NULL AND "actionExpiresAt" IS NOT NULL)
  ),
  CONSTRAINT "PaymentAttempt_claim_check" CHECK (("claimedBy" IS NULL) = ("claimExpiresAt" IS NULL))
);

CREATE TABLE "PaymentProviderEvent" (
  "id" UUID NOT NULL,
  "paymentIntentId" UUID,
  "provider" "PaymentProviderKind" NOT NULL,
  "providerEventId" VARCHAR(180) NOT NULL,
  "providerReference" VARCHAR(180),
  "normalizedType" VARCHAR(80) NOT NULL,
  "status" "PaymentProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payloadHash" VARCHAR(64) NOT NULL,
  "safeProviderCode" VARCHAR(80),
  "occurredAt" TIMESTAMPTZ(6) NOT NULL,
  "verifiedAt" TIMESTAMPTZ(6),
  "processedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentProviderEvent_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PaymentProviderEvent_verified_check" CHECK ("status" = 'RECEIVED' OR "verifiedAt" IS NOT NULL),
  CONSTRAINT "PaymentProviderEvent_processed_check" CHECK ("status" NOT IN ('PROCESSED', 'IGNORED', 'FAILED') OR "processedAt" IS NOT NULL)
);

CREATE TABLE "PaymentRefund" (
  "id" UUID NOT NULL,
  "paymentIntentId" UUID NOT NULL,
  "amount" DECIMAL(18,3) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "reasonCode" "PaymentRefundReason" NOT NULL,
  "note" VARCHAR(500),
  "requestedByActorType" "PaymentActorType" NOT NULL,
  "requestedByActorId" VARCHAR(191) NOT NULL,
  "providerReference" VARCHAR(180),
  "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "safeProviderCode" VARCHAR(80),
  "claimedBy" VARCHAR(120),
  "claimExpiresAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefund_amount_check" CHECK ("amount" > 0 AND "amount" = trunc("amount") AND "amount" <= 999999999999999.000),
  CONSTRAINT "PaymentRefund_currency_check" CHECK ("currency" = 'IQD'),
  CONSTRAINT "PaymentRefund_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PaymentRefund_version_check" CHECK ("version" > 0),
  CONSTRAINT "PaymentRefund_claim_check" CHECK (("claimedBy" IS NULL) = ("claimExpiresAt" IS NULL)),
  CONSTRAINT "PaymentRefund_completion_check" CHECK (("status" = 'SUCCEEDED') = ("completedAt" IS NOT NULL))
);

CREATE TABLE "FinancialAccount" (
  "id" UUID NOT NULL,
  "organizationId" UUID,
  "family" "FinancialAccountFamily" NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialAccount_currency_check" CHECK ("currency" = 'IQD'),
  CONSTRAINT "FinancialAccount_owner_check" CHECK (
    ("family" = 'MERCHANT_PAYABLE' AND "organizationId" IS NOT NULL) OR
    ("family" <> 'MERCHANT_PAYABLE' AND "organizationId" IS NULL)
  )
);

CREATE TABLE "FinancialJournal" (
  "id" UUID NOT NULL,
  "sourceType" "FinancialJournalSource" NOT NULL,
  "sourceId" UUID NOT NULL,
  "paymentIntentId" UUID,
  "paymentRefundId" UUID,
  "currency" VARCHAR(3) NOT NULL,
  "status" "FinancialJournalStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "reversalOfJournalId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMPTZ(6),
  CONSTRAINT "FinancialJournal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialJournal_currency_check" CHECK ("currency" = 'IQD'),
  CONSTRAINT "FinancialJournal_posted_check" CHECK (("status" = 'DRAFT' AND "postedAt" IS NULL) OR ("status" IN ('POSTED', 'REVERSED') AND "postedAt" IS NOT NULL)),
  CONSTRAINT "FinancialJournal_reversal_check" CHECK (("sourceType" = 'REVERSAL') = ("reversalOfJournalId" IS NOT NULL)),
  CONSTRAINT "FinancialJournal_source_link_check" CHECK (
    ("sourceType" = 'CAPTURE' AND "paymentIntentId" IS NOT NULL AND "paymentRefundId" IS NULL) OR
    ("sourceType" = 'REFUND' AND "paymentIntentId" IS NOT NULL AND "paymentRefundId" IS NOT NULL) OR
    ("sourceType" IN ('SETTLEMENT', 'REVERSAL', 'RECONCILIATION'))
  )
);

CREATE TABLE "FinancialPosting" (
  "id" UUID NOT NULL,
  "journalId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "side" "FinancialPostingSide" NOT NULL,
  "amount" DECIMAL(18,3) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialPosting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialPosting_amount_check" CHECK ("amount" > 0 AND "amount" = trunc("amount") AND "amount" <= 999999999999999.000)
);

CREATE TABLE "PaymentMutation" (
  "id" UUID NOT NULL,
  "actorType" "PaymentActorType" NOT NULL,
  "actorKey" VARCHAR(220) NOT NULL,
  "actorPersonId" UUID,
  "organizationId" UUID,
  "paymentIntentId" UUID,
  "action" "PaymentMutationAction" NOT NULL,
  "targetType" "PaymentTargetType" NOT NULL,
  "targetId" UUID NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "expectedVersion" INTEGER,
  "resultVersion" INTEGER,
  "status" "PaymentMutationStatus" NOT NULL DEFAULT 'PROCESSING',
  "result" JSONB,
  "failureCode" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PaymentMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentMutation_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PaymentMutation_versions_check" CHECK (("expectedVersion" IS NULL OR "expectedVersion" > 0) AND ("resultVersion" IS NULL OR "resultVersion" > 0)),
  CONSTRAINT "PaymentMutation_actor_check" CHECK (
    ("actorType" IN ('CUSTOMER', 'MERCHANT') AND "actorPersonId" IS NOT NULL) OR
    ("actorType" IN ('ADMIN', 'SYSTEM', 'PROVIDER') AND "actorPersonId" IS NULL)
  )
);

CREATE TABLE "SettlementBatch" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "SettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "periodStart" TIMESTAMPTZ(6) NOT NULL,
  "periodEnd" TIMESTAMPTZ(6) NOT NULL,
  "captureGross" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "refunds" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "commission" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "merchantNet" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "idempotencyKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "finalizedByAdminId" VARCHAR(191),
  "finalizedAt" TIMESTAMPTZ(6),
  "voidedAt" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettlementBatch_currency_check" CHECK ("currency" = 'IQD'),
  CONSTRAINT "SettlementBatch_period_check" CHECK ("periodStart" < "periodEnd"),
  CONSTRAINT "SettlementBatch_amounts_check" CHECK ("captureGross" >= 0 AND "refunds" >= 0 AND "commission" >= 0 AND "merchantNet" = "captureGross" - "refunds" - "commission"),
  CONSTRAINT "SettlementBatch_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "SettlementBatch_version_check" CHECK ("version" > 0),
  CONSTRAINT "SettlementBatch_state_time_check" CHECK (
    ("status" = 'DRAFT' AND "finalizedAt" IS NULL AND "voidedAt" IS NULL) OR
    ("status" = 'FINALIZED' AND "finalizedAt" IS NOT NULL AND "voidedAt" IS NULL) OR
    ("status" = 'VOID' AND "finalizedAt" IS NOT NULL AND "voidedAt" IS NOT NULL)
  )
);

CREATE TABLE "SettlementLine" (
  "id" UUID NOT NULL,
  "settlementBatchId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "journalId" UUID NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "captureGross" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "refunds" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "commission" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "merchantNet" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettlementLine_currency_check" CHECK ("currency" = 'IQD'),
  CONSTRAINT "SettlementLine_amounts_check" CHECK ("captureGross" >= 0 AND "refunds" >= 0 AND "commission" >= 0 AND "merchantNet" = "captureGross" - "refunds" - "commission")
);

CREATE UNIQUE INDEX "Payment_paymentIntentId_key" ON "Payment"("paymentIntentId");
CREATE UNIQUE INDEX "PaymentIntent_provider_providerReference_key" ON "PaymentIntent"("provider", "providerReference");
CREATE UNIQUE INDEX "PaymentIntent_orderId_generation_key" ON "PaymentIntent"("orderId", "generation");
CREATE UNIQUE INDEX "PaymentIntent_bookingId_generation_key" ON "PaymentIntent"("bookingId", "generation");
CREATE INDEX "PaymentIntent_createdAt_id_idx" ON "PaymentIntent"("createdAt", "id");
CREATE INDEX "PaymentIntent_customerPersonId_createdAt_id_idx" ON "PaymentIntent"("customerPersonId", "createdAt", "id");
CREATE INDEX "PaymentIntent_organizationId_createdAt_id_idx" ON "PaymentIntent"("organizationId", "createdAt", "id");
CREATE INDEX "PaymentIntent_organizationId_status_createdAt_id_idx" ON "PaymentIntent"("organizationId", "status", "createdAt", "id");
CREATE INDEX "PaymentIntent_organizationId_updatedAt_id_idx" ON "PaymentIntent"("organizationId", "updatedAt", "id");
CREATE INDEX "PaymentIntent_status_updatedAt_id_idx" ON "PaymentIntent"("status", "updatedAt", "id");
CREATE INDEX "PaymentIntent_updatedAt_id_idx" ON "PaymentIntent"("updatedAt", "id");
CREATE UNIQUE INDEX "PaymentIntent_order_active_key" ON "PaymentIntent"("orderId") WHERE "orderId" IS NOT NULL AND "status" IN ('CREATED','REQUIRES_ACTION','PROCESSING','AUTHORIZED','PARTIALLY_CAPTURED','CAPTURED','PARTIALLY_REFUNDED');
CREATE UNIQUE INDEX "PaymentIntent_booking_active_key" ON "PaymentIntent"("bookingId") WHERE "bookingId" IS NOT NULL AND "status" IN ('CREATED','REQUIRES_ACTION','PROCESSING','AUTHORIZED','PARTIALLY_CAPTURED','CAPTURED','PARTIALLY_REFUNDED');

CREATE UNIQUE INDEX "PaymentAttempt_paymentIntentId_attemptNumber_key" ON "PaymentAttempt"("paymentIntentId", "attemptNumber");
CREATE UNIQUE INDEX "PaymentAttempt_paymentIntentId_idempotencyKey_key" ON "PaymentAttempt"("paymentIntentId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentAttempt_provider_providerRequestReference_key" ON "PaymentAttempt"("provider", "providerRequestReference");
CREATE INDEX "PaymentAttempt_paymentIntentId_createdAt_id_idx" ON "PaymentAttempt"("paymentIntentId", "createdAt", "id");
CREATE INDEX "PaymentAttempt_status_claimExpiresAt_idx" ON "PaymentAttempt"("status", "claimExpiresAt");

CREATE UNIQUE INDEX "PaymentProviderEvent_provider_providerEventId_key" ON "PaymentProviderEvent"("provider", "providerEventId");
CREATE INDEX "PaymentProviderEvent_provider_providerReference_idx" ON "PaymentProviderEvent"("provider", "providerReference");
CREATE INDEX "PaymentProviderEvent_paymentIntentId_occurredAt_id_idx" ON "PaymentProviderEvent"("paymentIntentId", "occurredAt", "id");
CREATE INDEX "PaymentProviderEvent_status_createdAt_id_idx" ON "PaymentProviderEvent"("status", "createdAt", "id");

CREATE UNIQUE INDEX "PaymentRefund_requestedByActorType_requestedByActorId_idemp_key" ON "PaymentRefund"("requestedByActorType", "requestedByActorId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentRefund_providerReference_key" ON "PaymentRefund"("providerReference");
CREATE INDEX "PaymentRefund_createdAt_id_idx" ON "PaymentRefund"("createdAt", "id");
CREATE INDEX "PaymentRefund_paymentIntentId_createdAt_id_idx" ON "PaymentRefund"("paymentIntentId", "createdAt", "id");
CREATE INDEX "PaymentRefund_status_createdAt_id_idx" ON "PaymentRefund"("status", "createdAt", "id");
CREATE INDEX "PaymentRefund_status_claimExpiresAt_idx" ON "PaymentRefund"("status", "claimExpiresAt");

CREATE UNIQUE INDEX "FinancialAccount_organizationId_family_currency_key" ON "FinancialAccount"("organizationId", "family", "currency");
CREATE UNIQUE INDEX "FinancialAccount_platform_family_currency_key" ON "FinancialAccount"("family", "currency") WHERE "organizationId" IS NULL;
CREATE INDEX "FinancialAccount_family_currency_idx" ON "FinancialAccount"("family", "currency");

CREATE UNIQUE INDEX "FinancialJournal_idempotencyKey_key" ON "FinancialJournal"("idempotencyKey");
CREATE UNIQUE INDEX "FinancialJournal_reversalOfJournalId_key" ON "FinancialJournal"("reversalOfJournalId");
CREATE UNIQUE INDEX "FinancialJournal_sourceType_sourceId_key" ON "FinancialJournal"("sourceType", "sourceId");
CREATE INDEX "FinancialJournal_createdAt_id_idx" ON "FinancialJournal"("createdAt", "id");
CREATE INDEX "FinancialJournal_paymentIntentId_createdAt_id_idx" ON "FinancialJournal"("paymentIntentId", "createdAt", "id");
CREATE INDEX "FinancialJournal_status_createdAt_id_idx" ON "FinancialJournal"("status", "createdAt", "id");
CREATE INDEX "FinancialJournal_status_postedAt_id_idx" ON "FinancialJournal"("status", "postedAt", "id");
CREATE INDEX "FinancialPosting_journalId_idx" ON "FinancialPosting"("journalId");
CREATE INDEX "FinancialPosting_accountId_createdAt_id_idx" ON "FinancialPosting"("accountId", "createdAt", "id");

CREATE UNIQUE INDEX "PaymentMutation_actorKey_idempotencyKey_key" ON "PaymentMutation"("actorKey", "idempotencyKey");
CREATE INDEX "PaymentMutation_paymentIntentId_createdAt_id_idx" ON "PaymentMutation"("paymentIntentId", "createdAt", "id");
CREATE INDEX "PaymentMutation_organizationId_createdAt_id_idx" ON "PaymentMutation"("organizationId", "createdAt", "id");
CREATE INDEX "PaymentMutation_status_createdAt_id_idx" ON "PaymentMutation"("status", "createdAt", "id");

CREATE UNIQUE INDEX "SettlementBatch_organizationId_idempotencyKey_key" ON "SettlementBatch"("organizationId", "idempotencyKey");
CREATE INDEX "SettlementBatch_createdAt_id_idx" ON "SettlementBatch"("createdAt", "id");
CREATE INDEX "SettlementBatch_organizationId_createdAt_id_idx" ON "SettlementBatch"("organizationId", "createdAt", "id");
CREATE INDEX "SettlementBatch_status_createdAt_id_idx" ON "SettlementBatch"("status", "createdAt", "id");
CREATE UNIQUE INDEX "SettlementLine_settlementBatchId_journalId_key" ON "SettlementLine"("settlementBatchId", "journalId");
CREATE INDEX "SettlementLine_journalId_idx" ON "SettlementLine"("journalId");
CREATE INDEX "SettlementLine_organizationId_createdAt_id_idx" ON "SettlementLine"("organizationId", "createdAt", "id");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_customerPersonId_fkey" FOREIGN KEY ("customerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialJournal" ADD CONSTRAINT "FinancialJournal_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialJournal" ADD CONSTRAINT "FinancialJournal_paymentRefundId_fkey" FOREIGN KEY ("paymentRefundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialJournal" ADD CONSTRAINT "FinancialJournal_reversalOfJournalId_fkey" FOREIGN KEY ("reversalOfJournalId") REFERENCES "FinancialJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialPosting" ADD CONSTRAINT "FinancialPosting_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "FinancialJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialPosting" ADD CONSTRAINT "FinancialPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMutation" ADD CONSTRAINT "PaymentMutation_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMutation" ADD CONSTRAINT "PaymentMutation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMutation" ADD CONSTRAINT "PaymentMutation_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "FinancialJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION rezno_payment_intent_target_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_customer UUID;
  target_organization UUID;
  target_store UUID;
BEGIN
  IF NEW."orderId" IS NOT NULL THEN
    SELECT o."customerId", s."organizationId", o."storeId"
      INTO target_customer, target_organization, target_store
      FROM "Order" o JOIN "Store" s ON s."id" = o."storeId"
      WHERE o."id" = NEW."orderId";
    IF target_customer IS NULL OR target_customer <> NEW."customerPersonId" OR target_organization <> NEW."organizationId" OR target_store IS DISTINCT FROM NEW."storeId" THEN
      RAISE EXCEPTION 'PAYMENT_TARGET_INTEGRITY';
    END IF;
  ELSE
    SELECT b."customerId", b."organizationId"
      INTO target_customer, target_organization
      FROM "Booking" b WHERE b."id" = NEW."bookingId";
    IF target_customer IS NULL OR target_customer <> NEW."customerPersonId" OR target_organization <> NEW."organizationId" OR NEW."storeId" IS NOT NULL THEN
      RAISE EXCEPTION 'PAYMENT_TARGET_INTEGRITY';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PaymentIntent_target_integrity_trigger"
BEFORE INSERT OR UPDATE ON "PaymentIntent"
FOR EACH ROW EXECUTE FUNCTION rezno_payment_intent_target_integrity();

CREATE OR REPLACE FUNCTION rezno_payment_compatibility_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intent_order UUID;
BEGIN
  IF NEW."paymentIntentId" IS NOT NULL THEN
    SELECT "orderId" INTO intent_order FROM "PaymentIntent" WHERE "id" = NEW."paymentIntentId";
    IF intent_order IS NULL OR intent_order <> NEW."orderId" OR NEW."method" <> 'ONLINE_PROVIDER' THEN
      RAISE EXCEPTION 'PAYMENT_COMPATIBILITY_INTEGRITY';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_compatibility_integrity_trigger"
BEFORE INSERT OR UPDATE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION rezno_payment_compatibility_integrity();

CREATE OR REPLACE FUNCTION rezno_financial_posting_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_state "FinancialJournalStatus";
DECLARE journal_currency VARCHAR(3);
DECLARE account_currency VARCHAR(3);
BEGIN
  SELECT "status", "currency" INTO journal_state, journal_currency FROM "FinancialJournal" WHERE "id" = COALESCE(NEW."journalId", OLD."journalId") FOR UPDATE;
  IF TG_OP IN ('UPDATE', 'DELETE') AND journal_state <> 'DRAFT' THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_POSTING_IMMUTABLE';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "currency" INTO account_currency FROM "FinancialAccount" WHERE "id" = NEW."accountId";
    IF account_currency IS NULL OR account_currency <> journal_currency THEN
      RAISE EXCEPTION 'FINANCIAL_POSTING_CURRENCY_MISMATCH';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "FinancialPosting_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "FinancialPosting"
FOR EACH ROW EXECUTE FUNCTION rezno_financial_posting_guard();

CREATE OR REPLACE FUNCTION rezno_financial_journal_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_total NUMERIC(18,3);
DECLARE credit_total NUMERIC(18,3);
DECLARE posting_count INTEGER;
DECLARE original_currency VARCHAR(3);
DECLARE original_intent UUID;
DECLARE original_refund UUID;
DECLARE original_status "FinancialJournalStatus";
BEGIN
  IF NEW."status" IN ('POSTED', 'REVERSED') THEN
    SELECT
      COALESCE(SUM("amount") FILTER (WHERE "side" = 'DEBIT'), 0),
      COALESCE(SUM("amount") FILTER (WHERE "side" = 'CREDIT'), 0),
      COUNT(*)
    INTO debit_total, credit_total, posting_count
    FROM "FinancialPosting" WHERE "journalId" = NEW."id";
    IF posting_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'FINANCIAL_LEDGER_IMBALANCE';
    END IF;
  END IF;
  IF NEW."sourceType" = 'REVERSAL' AND NEW."status" IN ('POSTED', 'REVERSED') THEN
    SELECT "currency", "paymentIntentId", "paymentRefundId", "status"
      INTO original_currency, original_intent, original_refund, original_status
      FROM "FinancialJournal" WHERE "id" = NEW."reversalOfJournalId";
    IF original_status IS NULL OR original_status NOT IN ('POSTED', 'REVERSED') OR NEW."sourceId" <> NEW."reversalOfJournalId" OR
       NEW."currency" <> original_currency OR NEW."paymentIntentId" IS DISTINCT FROM original_intent OR
       NEW."paymentRefundId" IS DISTINCT FROM original_refund OR EXISTS (
         SELECT 1
         FROM "FinancialPosting" posting
         WHERE posting."journalId" IN (NEW."id", NEW."reversalOfJournalId")
         GROUP BY posting."accountId"
         HAVING
           COALESCE(SUM(posting."amount") FILTER (WHERE posting."journalId" = NEW."reversalOfJournalId" AND posting."side" = 'DEBIT'), 0) <>
             COALESCE(SUM(posting."amount") FILTER (WHERE posting."journalId" = NEW."id" AND posting."side" = 'CREDIT'), 0)
           OR
           COALESCE(SUM(posting."amount") FILTER (WHERE posting."journalId" = NEW."reversalOfJournalId" AND posting."side" = 'CREDIT'), 0) <>
             COALESCE(SUM(posting."amount") FILTER (WHERE posting."journalId" = NEW."id" AND posting."side" = 'DEBIT'), 0)
       ) THEN
      RAISE EXCEPTION 'FINANCIAL_REVERSAL_INTEGRITY';
    END IF;
  END IF;
  IF NEW."status" = 'REVERSED' AND NEW."sourceType" <> 'REVERSAL' AND NOT EXISTS (
    SELECT 1 FROM "FinancialJournal" reversal
    WHERE reversal."reversalOfJournalId" = NEW."id" AND reversal."status" = 'POSTED'
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_REVERSAL_MISSING';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "FinancialJournal_balance_trigger"
AFTER INSERT OR UPDATE OF "status" ON "FinancialJournal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rezno_financial_journal_balance();

CREATE OR REPLACE FUNCTION rezno_financial_journal_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_JOURNAL_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    IF NEW."id" <> OLD."id" OR NEW."sourceType" <> OLD."sourceType" OR NEW."sourceId" <> OLD."sourceId" OR
       NEW."paymentIntentId" IS DISTINCT FROM OLD."paymentIntentId" OR NEW."paymentRefundId" IS DISTINCT FROM OLD."paymentRefundId" OR
       NEW."currency" <> OLD."currency" OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR
       NEW."reversalOfJournalId" IS DISTINCT FROM OLD."reversalOfJournalId" OR NEW."createdAt" <> OLD."createdAt" OR NEW."postedAt" <> OLD."postedAt" OR
       NOT (OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED') AND NEW."status" <> OLD."status" THEN
      RAISE EXCEPTION 'POSTED_FINANCIAL_JOURNAL_IMMUTABLE';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "FinancialJournal_immutability_trigger"
BEFORE UPDATE OR DELETE ON "FinancialJournal"
FOR EACH ROW EXECUTE FUNCTION rezno_financial_journal_immutability();

CREATE OR REPLACE FUNCTION rezno_payment_refund_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE captured NUMERIC(18,3);
DECLARE reserved NUMERIC(18,3);
BEGIN
  SELECT "capturedAmount" INTO captured FROM "PaymentIntent" WHERE "id" = NEW."paymentIntentId" FOR UPDATE;
  SELECT COALESCE(SUM("amount"), 0) INTO reserved
    FROM "PaymentRefund"
    WHERE "paymentIntentId" = NEW."paymentIntentId"
      AND "id" <> NEW."id"
      AND "status" IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED');
  IF NEW."status" IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED') AND reserved + NEW."amount" > captured THEN
    RAISE EXCEPTION 'REFUND_AMOUNT_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PaymentRefund_capacity_trigger"
BEFORE INSERT OR UPDATE ON "PaymentRefund"
FOR EACH ROW EXECUTE FUNCTION rezno_payment_refund_capacity();

CREATE OR REPLACE FUNCTION rezno_settlement_batch_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_record RECORD;
DECLARE line_capture NUMERIC(18,3);
DECLARE line_refunds NUMERIC(18,3);
DECLARE line_commission NUMERIC(18,3);
DECLARE line_merchant_net NUMERIC(18,3);
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'FINALIZED_SETTLEMENT_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('FINALIZED', 'VOID') THEN
    IF NOT (OLD."status" = 'FINALIZED' AND NEW."status" = 'VOID' AND NEW."voidedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'FINALIZED_SETTLEMENT_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'DRAFT' AND NEW."status" = 'FINALIZED' THEN
    FOR journal_record IN
      SELECT "journalId" FROM "SettlementLine" WHERE "settlementBatchId" = NEW."id" ORDER BY "journalId"
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('rezno:settlement:' || journal_record."journalId"::text, 0));
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM "SettlementLine" own_line
      JOIN "SettlementLine" other_line ON other_line."journalId" = own_line."journalId" AND other_line."settlementBatchId" <> own_line."settlementBatchId"
      JOIN "SettlementBatch" other_batch ON other_batch."id" = other_line."settlementBatchId" AND other_batch."status" = 'FINALIZED'
      WHERE own_line."settlementBatchId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'SETTLEMENT_JOURNAL_ALREADY_FINALIZED';
    END IF;
    SELECT COALESCE(SUM("captureGross"), 0), COALESCE(SUM("refunds"), 0),
           COALESCE(SUM("commission"), 0), COALESCE(SUM("merchantNet"), 0)
      INTO line_capture, line_refunds, line_commission, line_merchant_net
      FROM "SettlementLine" WHERE "settlementBatchId" = NEW."id";
    IF NEW."captureGross" <> line_capture OR NEW."refunds" <> line_refunds OR
       NEW."commission" <> line_commission OR NEW."merchantNet" <> line_merchant_net THEN
      RAISE EXCEPTION 'SETTLEMENT_TOTAL_INTEGRITY';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SettlementBatch_guard_trigger"
BEFORE UPDATE OR DELETE ON "SettlementBatch"
FOR EACH ROW EXECUTE FUNCTION rezno_settlement_batch_guard();

CREATE OR REPLACE FUNCTION rezno_settlement_line_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_state "SettlementBatchStatus";
DECLARE batch_org UUID;
DECLARE batch_currency VARCHAR(3);
DECLARE journal_currency VARCHAR(3);
DECLARE journal_state "FinancialJournalStatus";
DECLARE journal_source "FinancialJournalSource";
DECLARE journal_organization UUID;
BEGIN
  SELECT "status", "organizationId", "currency" INTO batch_state, batch_org, batch_currency
    FROM "SettlementBatch" WHERE "id" = COALESCE(NEW."settlementBatchId", OLD."settlementBatchId");
  IF batch_state <> 'DRAFT' THEN RAISE EXCEPTION 'FINALIZED_SETTLEMENT_IMMUTABLE'; END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT journal."currency", journal."status", journal."sourceType", intent."organizationId"
      INTO journal_currency, journal_state, journal_source, journal_organization
      FROM "FinancialJournal" journal
      LEFT JOIN "PaymentIntent" intent ON intent."id" = journal."paymentIntentId"
      WHERE journal."id" = NEW."journalId";
    IF NEW."organizationId" <> batch_org OR NEW."currency" <> batch_currency OR journal_currency <> batch_currency OR
       journal_state <> 'POSTED' OR journal_source NOT IN ('CAPTURE', 'REFUND') OR journal_organization <> batch_org THEN
      RAISE EXCEPTION 'SETTLEMENT_LINE_INTEGRITY';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SettlementLine_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "SettlementLine"
FOR EACH ROW EXECUTE FUNCTION rezno_settlement_line_guard();
