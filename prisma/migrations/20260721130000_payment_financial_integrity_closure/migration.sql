-- Migration 41 is already deployed. Replace only the affected database guards
-- so posted ledger history and finalized settlement statements remain immutable.

CREATE OR REPLACE FUNCTION rezno_financial_posting_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_state "FinancialJournalStatus";
DECLARE journal_currency VARCHAR(3);
DECLARE account_currency VARCHAR(3);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."journalId" <> OLD."journalId" THEN
    RAISE EXCEPTION 'FINANCIAL_POSTING_JOURNAL_IMMUTABLE';
  END IF;

  SELECT "status", "currency" INTO journal_state, journal_currency
    FROM "FinancialJournal"
    WHERE "id" = COALESCE(NEW."journalId", OLD."journalId")
    FOR UPDATE;

  IF journal_state IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_POSTING_JOURNAL_MISSING';
  END IF;
  IF journal_state <> 'DRAFT' THEN
    RAISE EXCEPTION 'POSTED_FINANCIAL_POSTING_IMMUTABLE';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT "currency" INTO account_currency
      FROM "FinancialAccount"
      WHERE "id" = NEW."accountId";
    IF account_currency IS NULL OR account_currency <> journal_currency THEN
      RAISE EXCEPTION 'FINANCIAL_POSTING_CURRENCY_MISMATCH';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION rezno_settlement_batch_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_record RECORD;
DECLARE line_capture NUMERIC(18,3);
DECLARE line_refunds NUMERIC(18,3);
DECLARE line_commission NUMERIC(18,3);
DECLARE line_merchant_net NUMERIC(18,3);
DECLARE line_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'SETTLEMENT_MUST_START_DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'FINALIZED_SETTLEMENT_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'VOID' THEN
    RAISE EXCEPTION 'FINALIZED_SETTLEMENT_IMMUTABLE';
  END IF;

  IF OLD."status" = 'FINALIZED' THEN
    IF NOT (
      NEW."status" = 'VOID' AND
      NEW."voidedAt" IS NOT NULL AND
      NEW."version" = OLD."version" + 1 AND
      NEW."id" = OLD."id" AND
      NEW."organizationId" = OLD."organizationId" AND
      NEW."currency" = OLD."currency" AND
      NEW."periodStart" = OLD."periodStart" AND
      NEW."periodEnd" = OLD."periodEnd" AND
      NEW."captureGross" = OLD."captureGross" AND
      NEW."refunds" = OLD."refunds" AND
      NEW."commission" = OLD."commission" AND
      NEW."merchantNet" = OLD."merchantNet" AND
      NEW."idempotencyKey" = OLD."idempotencyKey" AND
      NEW."requestHash" = OLD."requestHash" AND
      NEW."finalizedByAdminId" IS NOT DISTINCT FROM OLD."finalizedByAdminId" AND
      NEW."finalizedAt" IS NOT DISTINCT FROM OLD."finalizedAt" AND
      NEW."createdAt" = OLD."createdAt"
    ) THEN
      RAISE EXCEPTION 'FINALIZED_SETTLEMENT_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'VOID' THEN
    RAISE EXCEPTION 'SETTLEMENT_MUST_BE_FINALIZED_BEFORE_VOID';
  END IF;

  IF OLD."status" = 'DRAFT' AND NEW."status" = 'FINALIZED' THEN
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
    IF EXISTS (
      SELECT 1
      FROM "SettlementLine" settlement_line
      JOIN "FinancialJournal" journal ON journal."id" = settlement_line."journalId"
      LEFT JOIN "PaymentIntent" intent ON intent."id" = journal."paymentIntentId"
      WHERE settlement_line."settlementBatchId" = NEW."id" AND (
        settlement_line."organizationId" <> NEW."organizationId" OR
        settlement_line."currency" <> NEW."currency" OR
        journal."currency" <> NEW."currency" OR
        journal."status" <> 'POSTED' OR
        journal."sourceType" NOT IN ('CAPTURE', 'REFUND') OR
        intent."organizationId" IS DISTINCT FROM NEW."organizationId" OR
        journal."postedAt" < NEW."periodStart" OR
        journal."postedAt" >= NEW."periodEnd"
      )
    ) THEN
      RAISE EXCEPTION 'SETTLEMENT_LINE_INTEGRITY';
    END IF;
    SELECT COALESCE(SUM("captureGross"), 0), COALESCE(SUM("refunds"), 0),
           COALESCE(SUM("commission"), 0), COALESCE(SUM("merchantNet"), 0), COUNT(*)
      INTO line_capture, line_refunds, line_commission, line_merchant_net, line_count
      FROM "SettlementLine" WHERE "settlementBatchId" = NEW."id";
    IF line_count = 0 THEN
      RAISE EXCEPTION 'EMPTY_SETTLEMENT_CANNOT_FINALIZE';
    END IF;
    IF NEW."captureGross" <> line_capture OR NEW."refunds" <> line_refunds OR
       NEW."commission" <> line_commission OR NEW."merchantNet" <> line_merchant_net THEN
      RAISE EXCEPTION 'SETTLEMENT_TOTAL_INTEGRITY';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER "SettlementBatch_guard_trigger" ON "SettlementBatch";
CREATE TRIGGER "SettlementBatch_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "SettlementBatch"
FOR EACH ROW EXECUTE FUNCTION rezno_settlement_batch_guard();
