import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseGate6CTrigger } from "../../../features/platform-jobs/api/validation";
import {
  requiredPlatformJobPermissions,
  requiredPlatformSchedulePermissions,
} from "../../../features/platform-jobs/domain/authority";
import {
  PLATFORM_JOB_DISCOVERY_TYPES,
  STAGE_6_ARCHITECTURE,
} from "../../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import {
  parsePlatformJobPayload,
  parsePlatformJobResult,
} from "../../../features/platform-jobs/domain/registry";

const code = (expected: string) => (error: unknown) =>
  error instanceof PlatformJobDomainError && error.code === expected;

test("Gate 6C locks status, joint authority, and schedule ownership", () => {
  assert.deepEqual(STAGE_6_ARCHITECTURE.gates, {
    gate6A: "ACCEPTED",
    gate6B: "ACCEPTED",
    gate6C: "ACTIVE",
    gate6D: "UNSTARTED",
  });
  assert.deepEqual(requiredPlatformJobPermissions("PAYMENT_PROVIDER_EVENT_PROCESS"), [
    "PLATFORM_JOBS_MANAGE",
    "PAYMENTS_RECONCILE",
  ]);
  assert.deepEqual(requiredPlatformJobPermissions("PAYMENT_REFUND_RETRY"), [
    "PLATFORM_JOBS_MANAGE",
    "PAYMENTS_REFUND",
    "PAYMENTS_RECONCILE",
  ]);
  assert.deepEqual(requiredPlatformSchedulePermissions("COMMUNICATION_CAMPAIGN_DISCOVERY"), [
    "PLATFORM_JOBS_MANAGE",
    "COMMUNICATIONS_DISPATCH",
  ]);
  assert.equal(PLATFORM_JOB_DISCOVERY_TYPES.includes("PAYMENT_RETRY_DISCOVERY"), true);
  assert.equal(PLATFORM_JOB_DISCOVERY_TYPES.includes("PAYMENT_RECONCILIATION" as never), false);
});

test("Gate 6C payloads contain strict references and reject copied authority", () => {
  const eventId = randomUUID();
  const accepted = {
    expectedVersion: 1,
    providerEventId: eventId,
  };
  assert.deepEqual(
    parsePlatformJobPayload("PAYMENT_PROVIDER_EVENT_PROCESS", 1, accepted),
    accepted,
  );
  for (const copied of [
    { amount: "1000" },
    { currency: "IQD" },
    { providerReference: "provider-secret" },
    { rawBody: "{}" },
    { signature: "secret" },
    { webhookUrl: "https://example.test" },
  ]) {
    assert.throws(
      () => parsePlatformJobPayload("PAYMENT_PROVIDER_EVENT_PROCESS", 1, {
        ...accepted,
        ...copied,
      }),
      code("VALIDATION_ERROR"),
    );
  }
  assert.deepEqual(
    parsePlatformJobPayload("SETTLEMENT_STATEMENT_GENERATE", 1, {
      batchSize: 50,
      periodDays: 1,
    }),
    { batchSize: 50, periodDays: 1 },
  );
  assert.throws(
    () => parsePlatformJobPayload("SETTLEMENT_STATEMENT_GENERATE", 1, {
      amount: "1",
      batchSize: 50,
      periodDays: 1,
    }),
    code("VALIDATION_ERROR"),
  );
});

test("Gate 6C results are closed and bounded", () => {
  const result = {
    kind: "PAYMENT_PROVIDER_EVENT_PROCESSED",
    outcome: "COMPLETED",
    state: "PROCESSED",
  };
  assert.deepEqual(
    parsePlatformJobResult("PAYMENT_PROVIDER_EVENT_PROCESS", result),
    result,
  );
  assert.throws(
    () => parsePlatformJobResult("PAYMENT_PROVIDER_EVENT_PROCESS", {
      ...result,
      providerResponse: "secret",
    }),
    code("PLATFORM_JOB_FAILURE"),
  );
  assert.throws(
    () => parsePlatformJobResult("PAYMENT_RECONCILIATION", {
      counts: {
        DATABASE_AHEAD: 0,
        LEDGER_MISMATCH: 0,
        MATCHED: 51,
        MISSING_PROVIDER_RECORD: 0,
        NOT_CONFIGURED: 0,
        PROVIDER_AHEAD: 0,
        TARGET_STATE_MISMATCH: 0,
      },
      kind: "PAYMENT_RECONCILED",
      scanned: 51,
    }),
    code("PLATFORM_JOB_FAILURE"),
  );
});

test("Gate 6C manual trigger is strict, bounded, and allow-listed", () => {
  const idempotencyKey = randomUUID();
  assert.deepEqual(parseGate6CTrigger({
    batchSize: 10,
    idempotencyKey,
    jobType: "PAYMENT_RETRY_DISCOVERY",
  }), {
    batchSize: 10,
    idempotencyKey,
    jobType: "PAYMENT_RETRY_DISCOVERY",
  });
  assert.throws(
    () => parseGate6CTrigger({
      batchSize: 10,
      idempotencyKey,
      jobType: "PAYMENT_ATTEMPT_RETRY",
    }),
    code("VALIDATION_ERROR"),
  );
  assert.throws(
    () => parseGate6CTrigger({
      batchSize: 10,
      command: "run",
      idempotencyKey,
      jobType: "PAYMENT_RETRY_DISCOVERY",
    }),
    code("VALIDATION_ERROR"),
  );
});

test("Migration 48 is additive, actorless only for exact provider events, and creates no rows", async () => {
  const source = await readFile(
    new URL(
      "../../../prisma/migrations/20260723180000_communications_payment_automation/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /ADD VALUE 'PROVIDER_EVENT'/u);
  assert.match(source, /"jobType"::text = 'PAYMENT_PROVIDER_EVENT_PROCESS'/u);
  assert.match(source, /"createdByAdminUserId" IS NULL/u);
  assert.match(source, /"createdByPersonId" IS NULL/u);
  assert.match(source, /"providerEventId" IS NOT NULL/u);
  assert.match(source, /SettlementBatch_one_draft_period_key/u);
  assert.match(source, /Gate 6C preflight failed/u);
  assert.doesNotMatch(source, /\bINSERT\s+INTO\b/iu);
  assert.doesNotMatch(source, /\bUPDATE\s+"(?:Communication|Payment|Settlement|PlatformJob)/u);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/iu);
});
