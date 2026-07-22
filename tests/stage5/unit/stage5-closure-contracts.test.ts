import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { MEDIA_JSON_BODY_MAX_BYTES } from "../../../features/media/domain/policy";
import { MEDIA_SLOT_REGISTRY } from "../../../features/media/domain/slot-registry";
import { storageMediaCapabilities } from "../../../features/media/services/capabilities";
import {
  PAYMENT_WEBHOOK_MAXIMUM_BYTES,
} from "../../../features/payments/api/validation";
import {
  PAYMENTS_GATE5C_EXCLUSIONS,
  PAYMENTS_STAGE6_WORKER_HANDOFF,
} from "../../../features/payments/domain/boundaries";
import { PAYMENT_CURSOR_SIGNING_INFO } from "../../../features/payments/domain/cursor-signing";
import { paymentProvider } from "../../../features/payments/providers/registry";
import { STAGE_5_CLOSURE } from "../../../features/stage5/domain/closure";
import {
  STORAGE_ASSET_CURSOR_SIGNING_INFO,
  STORAGE_SESSION_CURSOR_SIGNING_INFO,
} from "../../../features/storage/domain/cursor-signing";
import { STORAGE_JSON_BODY_MAX_BYTES } from "../../../features/storage/domain/policy";
import {
  ACTIVE_SESSION_RESERVATION_STATES,
  PROVIDER_RESIDENT_ASSET_STATES,
} from "../../../features/storage/domain/quota";
import { configuredStorageProvider } from "../../../features/storage/providers/registry";
import {
  assertStage5ClosureStaging,
  STAGE5_CLOSURE_CONFIRMATION,
} from "../../../scripts/staging/stage5-closure-safety";

test("Gate 5D registry locks the accepted gates, provider truth, and later-stage boundaries", () => {
  assert.deepEqual(Object.values(STAGE_5_CLOSURE.gates), [
    "ACCEPTED",
    "ACCEPTED",
    "ACCEPTED",
    "ACTIVE",
  ]);
  assert.equal(STAGE_5_CLOSURE.migrations.expectedCount, 42);
  assert.equal(STAGE_5_CLOSURE.migrations.nextMigrationPermitted, false);
  assert.equal(STAGE_5_CLOSURE.providers.storage, "NOT_CONFIGURED");
  assert.equal(STAGE_5_CLOSURE.providers.payment, "NOT_CONFIGURED");
  assert.equal(
    STAGE_5_CLOSURE.providers.settlementMeaning,
    "LEDGER_STATEMENT_NOT_BANK_PAYOUT",
  );
  assert.equal(STAGE_5_CLOSURE.operations.automaticScheduler, "NOT_CONNECTED");
  assert.equal(STAGE_5_CLOSURE.operations.durableWorker, "NOT_CONNECTED");
  assert.equal(
    STAGE_5_CLOSURE.deferred.stage6.includes("DURABLE_WORKERS_AND_QUEUES"),
    true,
  );
  assert.equal(STAGE_5_CLOSURE.deferred.stage7.includes("PHYSICAL_DEVICE_QA"), true);
  assert.equal(STAGE_5_CLOSURE.deferred.stage8.includes("BROAD_VISUAL_REDESIGN"), true);
  assert.deepEqual(STAGE_5_CLOSURE.deferred.ai, ["AFTER_STAGE_8"]);
});

test("production provider capability truth remains fail closed", () => {
  assert.equal(configuredStorageProvider().kind, "NOT_CONFIGURED");
  assert.equal(paymentProvider().kind, "NOT_CONFIGURED");
  const capabilities = storageMediaCapabilities();
  assert.equal(capabilities.type, "STORAGE_MEDIA_CAPABILITIES");
  assert.equal(capabilities.providerConfigured, false);
  assert.equal(capabilities.directUploadAvailable, false);
  assert.deepEqual(capabilities.supportedMimeTypes, [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.equal(capabilities.supportedMediaSlots.length, 9);
  assert.equal(Object.keys(capabilities.maximumSizeByPurpose).length, 10);
});

test("storage persistence, media slots, and request bounds remain closed registries", () => {
  assert.deepEqual(PROVIDER_RESIDENT_ASSET_STATES, [
    "PENDING_UPLOAD",
    "UPLOADED",
    "PENDING_INSPECTION",
    "READY",
    "QUARANTINED",
    "REJECTED",
    "DELETE_PENDING",
  ]);
  assert.deepEqual(ACTIVE_SESSION_RESERVATION_STATES, [
    "CREATED",
    "TARGET_ISSUED",
    "UPLOADED",
  ]);
  assert.deepEqual(Object.keys(MEDIA_SLOT_REGISTRY).sort(), [
    "BUSINESS_COVER",
    "BUSINESS_GALLERY",
    "BUSINESS_LOGO",
    "CUSTOMER_AVATAR",
    "MENU_ITEM_PRIMARY",
    "PRODUCT_IMAGE",
    "SERVICE_PRIMARY",
    "STORE_COVER",
    "STORE_LOGO",
  ]);
  assert.equal(STORAGE_JSON_BODY_MAX_BYTES, 32 * 1024);
  assert.equal(MEDIA_JSON_BODY_MAX_BYTES, 32 * 1024);
  assert.equal(PAYMENT_WEBHOOK_MAXIMUM_BYTES, 64 * 1024);
});

test("all Stage 5 signed cursor families are domain separated", () => {
  const domains = [
    STORAGE_ASSET_CURSOR_SIGNING_INFO,
    STORAGE_SESSION_CURSOR_SIGNING_INFO,
    ...Object.values(PAYMENT_CURSOR_SIGNING_INFO),
  ];
  assert.equal(new Set(domains).size, domains.length);
  for (const domain of domains) {
    assert.match(domain, /^rezno:(?:storage|payments):.+:v1$/);
  }
});

test("payment handoffs preserve the official Stage 6, 7, 8, and AI ownership", () => {
  assert.equal(PAYMENTS_GATE5C_EXCLUSIONS.includes("STAGE_6_JOBS_AND_WORKERS"), true);
  assert.equal(PAYMENTS_GATE5C_EXCLUSIONS.includes("STAGE_7_RELEASE_QA"), true);
  assert.equal(PAYMENTS_GATE5C_EXCLUSIONS.includes("STAGE_8_FINAL_VISUAL_POLISH"), true);
  assert.equal(PAYMENTS_GATE5C_EXCLUSIONS.includes("AI_AFTER_STAGE_8"), true);
  assert.equal(
    (PAYMENTS_GATE5C_EXCLUSIONS as readonly string[]).includes("STAGE_7_AI"),
    false,
  );
  assert.deepEqual(PAYMENTS_STAGE6_WORKER_HANDOFF, [
    "provider-event queue consumption",
    "scheduled reconciliation",
    "scheduled settlement statement generation",
    "provider retry orchestration",
  ]);
});

test("Stage 6 preserves Gate 5D through the Gate 6A foundation and Gate 6B additive migration", async () => {
  const migrations = (
    await readdir(new URL("../../../prisma/migrations/", import.meta.url), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrations.length, 45);
  assert.equal(
    migrations.includes("20260720140000_payments_financial_integrity_foundation"),
    true,
  );
  assert.equal(
    migrations.includes("20260721130000_payment_financial_integrity_closure"),
    true,
  );
  assert.equal(
    migrations.includes("20260721160000_platform_jobs_foundation"),
    true,
  );
  assert.equal(
    migrations.includes("20260722090000_platform_worker_operation_recovery"),
    true,
  );
  assert.equal(
    migrations.includes("20260722150000_storage_media_automation"),
    true,
  );
  assert.equal(migrations.filter((name) => name > "20260721130000_payment_financial_integrity_closure").length, 3);
});

test("provider registries reject production test-provider activation", async () => {
  const [storageRegistry, paymentRegistry] = await Promise.all([
    readFile(
      new URL("../../../features/storage/providers/registry.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../features/payments/providers/registry.ts", import.meta.url),
      "utf8",
    ),
  ]);
  for (const source of [storageRegistry, paymentRegistry]) {
    assert.match(source, /NODE_ENV === "production"/);
    assert.match(source, /test configuration is unavailable in production/);
  }
  assert.match(storageRegistry, /Deterministic storage provider cannot run in production/);
  assert.match(paymentRegistry, /if \(process\.env\.NODE_ENV === "production"\) return notConfigured/);
});

test("Gate 5D staging safety requires exact environment, database, and healthy 42/42", async () => {
  const environment = {
    NODE_ENV: "test",
    REZNO_ENV: "staging",
    REZNO_STAGE5_GATE5D_CONFIRM: STAGE5_CLOSURE_CONFIRMATION,
  } as NodeJS.ProcessEnv;
  let calls = 0;
  const healthy = {
    $queryRaw: async () => {
      calls += 1;
      return calls === 1
        ? [{ database: "rezno_staging" }]
        : [{ applied: BigInt(42), failed: BigInt(0), rolledBack: BigInt(0), total: BigInt(42) }];
    },
  };
  assert.deepEqual(await assertStage5ClosureStaging(healthy as never, environment), {
    database: "rezno_staging",
    migrations: "42/42",
    rolledBack: 0,
  });

  await assert.rejects(
    assertStage5ClosureStaging(healthy as never, {
      ...environment,
      NODE_ENV: "production",
    }),
    /exact staging environment/,
  );
  await assert.rejects(
    assertStage5ClosureStaging(
      { $queryRaw: async () => [{ database: "rezno_production" }] } as never,
      environment,
    ),
    /exact rezno_staging database/,
  );
  let unhealthyCalls = 0;
  await assert.rejects(
    assertStage5ClosureStaging(
      {
        $queryRaw: async () => {
          unhealthyCalls += 1;
          return unhealthyCalls === 1
            ? [{ database: "rezno_staging" }]
            : [{
                applied: BigInt(41),
                failed: BigInt(1),
                rolledBack: BigInt(0),
                total: BigInt(42),
              }];
        },
      } as never,
      environment,
    ),
    /healthy 42\/42 migration state/,
  );
});
