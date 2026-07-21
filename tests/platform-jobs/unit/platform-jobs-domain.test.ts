import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { readBoundedPlatformJobJson, parsePlatformJobListQuery, parsePlatformJobTrigger } from "../../../features/platform-jobs/api/validation";
import { platformJobCanonicalJson, platformJobHash, serializedUtf8Bytes } from "../../../features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_ALLOWED_TYPES, PLATFORM_JOB_LIMITS, STAGE_6_ARCHITECTURE } from "../../../features/platform-jobs/domain/contracts";
import { decodePlatformJobCursor, encodePlatformJobCursor, platformJobCursorBinding } from "../../../features/platform-jobs/domain/cursor";
import { setPlatformJobCursorSigningSecretForTests } from "../../../features/platform-jobs/domain/cursor-signing";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import { platformHeartbeatExpiry, platformLeaseExpiry, platformRetryDelayMs, safeFutureDate } from "../../../features/platform-jobs/domain/execution";
import { assertPlatformJobTransition, isPlatformJobCancellable, isPlatformJobRequeueable, isPlatformJobTerminal } from "../../../features/platform-jobs/domain/lifecycle";
import { isRetryablePlatformJobError, parsePlatformJobPayload, parsePlatformJobResult, platformHealthPayload, platformJobPayloadSummary } from "../../../features/platform-jobs/domain/registry";
import { calculatePlatformScheduleTick } from "../../../features/platform-jobs/domain/schedule";
import { executePlatformJobHandler, setPlatformJobHandlerForTests } from "../../../features/platform-jobs/services/handlers";
import { assertPlatformJobsGate6aStaging, PLATFORM_JOBS_GATE6A_CONFIRMATION } from "../../../scripts/staging/platform-jobs-gate6a-safety";

const secret = "gate6a-cursor-secret-with-sufficient-entropy-2026-07-21";
const ts = (microseconds: string) => `2026-07-21T12:00:00.${microseconds}Z`;

test.beforeEach(() => setPlatformJobCursorSigningSecretForTests(secret));
test.after(() => {
  setPlatformJobCursorSigningSecretForTests(undefined);
  setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE");
});

test("Stage 6 architecture locks the accepted title, gate order, providers, and later-stage boundaries", () => {
  assert.equal(STAGE_6_ARCHITECTURE.title, "Stage 6 — Admin and Platform Operations");
  assert.deepEqual(Object.values(STAGE_6_ARCHITECTURE.gates), ["ACTIVE", "UNSTARTED", "UNSTARTED", "UNSTARTED"]);
  assert.equal(STAGE_6_ARCHITECTURE.runtime.durableStore, "POSTGRESQL");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.externalQueueProvider, "NOT_CONFIGURED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.automaticScheduler, "NOT_CONNECTED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.alwaysOnWorker, "NOT_CONNECTED");
  assert.equal(STAGE_6_ARCHITECTURE.providers.storage, "NOT_CONFIGURED");
  assert.equal(STAGE_6_ARCHITECTURE.providers.payment, "NOT_CONFIGURED");
  assert.equal(STAGE_6_ARCHITECTURE.boundaries.stage7, "PHYSICAL_DEVICE_AND_RELEASE_QA");
  assert.equal(STAGE_6_ARCHITECTURE.boundaries.stage8, "BROAD_VISUAL_POLISH");
  assert.equal(STAGE_6_ARCHITECTURE.boundaries.ai, "AFTER_STAGE_8");
});

test("Gate 6A exposes one inert closed job type and explicit finite bounds", () => {
  assert.deepEqual(PLATFORM_JOB_ALLOWED_TYPES, ["PLATFORM_HEALTH_PROBE"]);
  assert.equal(PLATFORM_JOB_LIMITS.maxRequestBytes, 8_192);
  assert.equal(PLATFORM_JOB_LIMITS.maxPayloadBytes, 4_096);
  assert.equal(PLATFORM_JOB_LIMITS.maxResultBytes, 2_048);
  assert.equal(PLATFORM_JOB_LIMITS.maxWorkerBatch, 10);
  assert.equal(PLATFORM_JOB_LIMITS.maxSchedulerBatch, 10);
  assert.equal(PLATFORM_JOB_LIMITS.maxAttempts, 10);
  assert.equal(PLATFORM_JOB_LIMITS.maxScheduleCatchup, 10);
  assert.equal(PLATFORM_JOB_LIMITS.maxRequeues, 3);
});

test("canonical JSON and hashes ignore object key order but preserve changed values", () => {
  assert.equal(platformJobCanonicalJson({ z: 2, a: { y: 1, x: 0 } }), '{"a":{"x":0,"y":1},"z":2}');
  assert.equal(platformJobHash({ b: 2, a: 1 }), platformJobHash({ a: 1, b: 2 }));
  assert.notEqual(platformJobHash({ a: 1 }), platformJobHash({ a: 2 }));
  assert.equal(serializedUtf8Bytes({ value: "أ" }), Buffer.byteLength('{"value":"أ"}', "utf8"));
});

test("job registry accepts only strict versioned health references", () => {
  assert.deepEqual(parsePlatformJobPayload("PLATFORM_HEALTH_PROBE", 1, platformHealthPayload()), platformHealthPayload());
  assert.throws(() => parsePlatformJobPayload("PLATFORM_HEALTH_PROBE", 2, platformHealthPayload()), code("VALIDATION_ERROR"));
  assert.throws(() => parsePlatformJobPayload("PLATFORM_HEALTH_PROBE", 1, { ...platformHealthPayload(), url: "https://example.test/secret" }), code("VALIDATION_ERROR"));
  for (const forbidden of [
    { authorization: "Bearer secret" },
    { cardNumber: "4111111111111111" },
    { contactAddress: "private address" },
    { databaseUrl: "postgresql://secret" },
    { modulePath: "node:child_process" },
    { vin: "1HGCM82633A004352" },
  ]) assert.throws(() => parsePlatformJobPayload("PLATFORM_HEALTH_PROBE", 1, { ...platformHealthPayload(), ...forbidden }), code("VALIDATION_ERROR"));
  assert.deepEqual(parsePlatformJobResult("PLATFORM_HEALTH_PROBE", { executionGeneration: "1", kind: "PLATFORM_HEALTHY", payloadVersion: 1 }), { executionGeneration: "1", kind: "PLATFORM_HEALTHY", payloadVersion: 1 });
  assert.throws(() => parsePlatformJobResult("PLATFORM_HEALTH_PROBE", { executionGeneration: "1", kind: "PLATFORM_HEALTHY", payloadVersion: 1, token: "secret" }), code("PLATFORM_JOB_FAILURE"));
  assert.deepEqual(platformJobPayloadSummary("PLATFORM_HEALTH_PROBE", 1), { jobType: "PLATFORM_HEALTH_PROBE", payloadVersion: 1, containsReferencesOnly: true });
});

test("retry policy is closed, deterministic, exponentially bounded, and exhausts", () => {
  const jobId = randomUUID();
  const first = platformRetryDelayMs(jobId, 1, 5);
  assert.equal(first, platformRetryDelayMs(jobId, 1, 5));
  assert.ok(first !== null && first >= 30_000 && first <= 36_000);
  const fourth = platformRetryDelayMs(jobId, 4, 5);
  assert.ok(fourth !== null && fourth >= 192_000 && fourth <= 288_000);
  assert.equal(platformRetryDelayMs(jobId, 5, 5), null);
  assert.equal(isRetryablePlatformJobError("PLATFORM_HEALTH_PROBE", "HANDLER_TIMEOUT"), true);
  assert.equal(isRetryablePlatformJobError("PLATFORM_HEALTH_PROBE", "PERMANENT_FAILURE"), false);
  assert.throws(() => platformRetryDelayMs(jobId, 0, 5), code("VALIDATION_ERROR"));
});

test("lease creation and heartbeat extension enforce duration and horizon", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  assert.equal(platformLeaseExpiry(now, 30).toISOString(), "2026-07-21T12:00:30.000Z");
  assert.throws(() => platformLeaseExpiry(now, 29), code("VALIDATION_ERROR"));
  assert.throws(() => platformLeaseExpiry(now, 301), code("VALIDATION_ERROR"));
  assert.equal(platformHeartbeatExpiry(now, new Date(now.getTime() - 890_000), 120).toISOString(), "2026-07-21T12:00:10.000Z");
  assert.throws(() => platformHeartbeatExpiry(now, now, 121), code("VALIDATION_ERROR"));
  assert.throws(() => safeFutureDate(now, -1), code("VALIDATION_ERROR"));
});

test("lifecycle helpers close terminal, cancellable, and requeueable states", () => {
  assert.doesNotThrow(() => assertPlatformJobTransition("AVAILABLE", "CLAIMED"));
  assert.doesNotThrow(() => assertPlatformJobTransition("RUNNING", "SUCCEEDED"));
  assert.throws(() => assertPlatformJobTransition("SUCCEEDED", "AVAILABLE"), code("CONFLICT"));
  assert.equal(isPlatformJobTerminal("DEAD_LETTERED"), true);
  assert.equal(isPlatformJobCancellable("RETRY_WAIT"), true);
  assert.equal(isPlatformJobCancellable("RUNNING"), false);
  assert.equal(isPlatformJobRequeueable("FAILED"), true);
  assert.equal(isPlatformJobRequeueable("CANCELLED"), false);
});

test("schedule tick emits deterministic bounded catch-up and advances across skipped intervals", () => {
  const nextRunAt = new Date("2026-07-21T12:00:00.000Z");
  assert.deepEqual(calculatePlatformScheduleTick({ cadenceSeconds: 60, catchupLimit: 3, nextRunAt, now: new Date("2026-07-21T11:59:59.000Z") }), { due: [], nextRunAt, skipped: 0 });
  const tick = calculatePlatformScheduleTick({ cadenceSeconds: 60, catchupLimit: 3, nextRunAt, now: new Date("2026-07-21T12:05:30.000Z") });
  assert.deepEqual(tick.due.map((value) => value.toISOString()), [
    "2026-07-21T12:00:00.000Z", "2026-07-21T12:01:00.000Z", "2026-07-21T12:02:00.000Z",
  ]);
  assert.equal(tick.skipped, 3);
  assert.equal(tick.nextRunAt.toISOString(), "2026-07-21T12:06:00.000Z");
  assert.throws(() => calculatePlatformScheduleTick({ cadenceSeconds: 59, catchupLimit: 1, nextRunAt, now: nextRunAt }), code("VALIDATION_ERROR"));
});

test("signed cursors preserve PostgreSQL microseconds and bind kind, Admin scope, filters, and page size", () => {
  const id = randomUUID();
  const adminScope = platformJobCursorBinding({ personId: randomUUID(), userId: randomUUID() });
  const filter = platformJobCursorBinding({ status: "AVAILABLE" });
  const encoded = encodePlatformJobCursor("PLATFORM_JOB", { adminScope, filter, id, pageSize: 20, snapshot: ts("999999"), sortValue: ts("123456") });
  const decoded = decodePlatformJobCursor("PLATFORM_JOB", encoded, { adminScope, filter, pageSize: 20 }, "2026-07-21T12:00:01.000001Z");
  assert.equal(decoded.sortValue, ts("123456"));
  assert.throws(() => decodePlatformJobCursor("PLATFORM_JOB_SCHEDULE", encoded, { adminScope, filter, pageSize: 20 }, "2026-07-21T12:00:01.000001Z"), code("INVALID_CURSOR"));
  assert.throws(() => decodePlatformJobCursor("PLATFORM_JOB", encoded, { adminScope: platformJobHash("other"), filter, pageSize: 20 }, "2026-07-21T12:00:01.000001Z"), code("INVALID_CURSOR"));
  assert.throws(() => decodePlatformJobCursor("PLATFORM_JOB", encoded, { adminScope, filter: platformJobHash("changed"), pageSize: 20 }, "2026-07-21T12:00:01.000001Z"), code("INVALID_CURSOR"));
  assert.throws(() => decodePlatformJobCursor("PLATFORM_JOB", encoded, { adminScope, filter, pageSize: 10 }, "2026-07-21T12:00:01.000001Z"), code("INVALID_CURSOR"));
});

test("cursor authentication rejects tampering, future snapshots, and millisecond-only timestamps", () => {
  const expected = { adminScope: platformJobHash("admin"), filter: platformJobHash("filter"), pageSize: 1 };
  const encoded = encodePlatformJobCursor("PLATFORM_JOB", { ...expected, id: randomUUID(), snapshot: ts("000010"), sortValue: ts("000009") });
  const envelope = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  envelope.id = randomUUID();
  const tampered = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  assert.throws(() => decodePlatformJobCursor("PLATFORM_JOB", tampered, expected, ts("000020")), code("INVALID_CURSOR"));
  assert.throws(() => decodePlatformJobCursor("PLATFORM_JOB", encoded, expected, ts("000001")), code("INVALID_CURSOR"));
  assert.throws(() => encodePlatformJobCursor("PLATFORM_JOB", { ...expected, id: randomUUID(), snapshot: "2026-07-21T12:00:00.000Z", sortValue: ts("000001") }), code("INVALID_CURSOR"));
});

test("request parsers reject unknown fields, repeated query keys, invented job types, and invalid limits", () => {
  const idempotencyKey = randomUUID();
  assert.deepEqual(parsePlatformJobTrigger({ idempotencyKey, jobType: "PLATFORM_HEALTH_PROBE" }), { idempotencyKey, jobType: "PLATFORM_HEALTH_PROBE" });
  assert.throws(() => parsePlatformJobTrigger({ idempotencyKey, jobType: "PLATFORM_HEALTH_PROBE", payload: { secret: true } }), code("VALIDATION_ERROR"));
  assert.throws(() => parsePlatformJobTrigger({ idempotencyKey, jobType: "ARBITRARY_URL" }), code("VALIDATION_ERROR"));
  assert.throws(() => parsePlatformJobListQuery(new URL("https://rezno.test/jobs?limit=10&limit=20")), code("VALIDATION_ERROR"));
  assert.throws(() => parsePlatformJobListQuery(new URL("https://rezno.test/jobs?limit=51")), code("VALIDATION_ERROR"));
  assert.throws(() => parsePlatformJobListQuery(new URL("https://rezno.test/jobs?unknown=1")), code("VALIDATION_ERROR"));
});

test("streamed JSON reader enforces media type, declared and actual 8 KiB bounds, UTF-8, and JSON", async () => {
  const valid = new Request("https://rezno.test", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: '{"ok":true}' });
  assert.deepEqual(await readBoundedPlatformJobJson(valid), { ok: true });
  await assert.rejects(readBoundedPlatformJobJson(new Request("https://rezno.test", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })), code("VALIDATION_ERROR"));
  await assert.rejects(readBoundedPlatformJobJson(new Request("https://rezno.test", { method: "POST", headers: { "content-type": "application/json", "content-length": "8193" }, body: "{}" })), code("PAYLOAD_TOO_LARGE"));
  await assert.rejects(readBoundedPlatformJobJson(new Request("https://rezno.test", { method: "POST", headers: { "content-type": "application/json" }, body: `"${"x".repeat(8_192)}"` })), code("PAYLOAD_TOO_LARGE"));
  await assert.rejects(readBoundedPlatformJobJson(new Request("https://rezno.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), code("VALIDATION_ERROR"));
  const invalidUtf8 = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Uint8Array.of(0xc3, 0x28)); controller.close(); } });
  await assert.rejects(readBoundedPlatformJobJson(new Request("https://rezno.test", { method: "POST", headers: { "content-type": "application/json" }, body: invalidUtf8, duplex: "half" } as RequestInit)), code("VALIDATION_ERROR"));
});

test("health handler succeeds with bounded metadata and converts raw exceptions into a safe code", async () => {
  const input = { fencingToken: BigInt(1), jobId: randomUUID(), jobType: "PLATFORM_HEALTH_PROBE" as const, leaseToken: randomUUID(), payload: platformHealthPayload(), payloadVersion: 1 };
  assert.deepEqual(await executePlatformJobHandler(input), { metadata: { executionGeneration: "1", kind: "PLATFORM_HEALTHY", payloadVersion: 1 }, outcome: "SUCCEEDED" });
  setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE", async () => { throw new Error("raw-provider-secret"); });
  assert.deepEqual(await executePlatformJobHandler(input), { errorCode: "HANDLER_EXCEPTION", outcome: "FAILED", retryable: true });
  setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE");
});

test("production-only guards and migration 43 are explicit in source", async () => {
  const [cursorSource, handlerSource, migrations] = await Promise.all([
    readFile(new URL("../../../features/platform-jobs/domain/cursor-signing.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/platform-jobs/services/handlers.ts", import.meta.url), "utf8"),
    readdir(new URL("../../../prisma/migrations/", import.meta.url), { withFileTypes: true }),
  ]);
  assert.match(cursorSource, /NODE_ENV === "production"/);
  assert.match(handlerSource, /NODE_ENV === "production"/);
  const names = migrations.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.equal(names.length, 43);
  assert.equal(names.at(-1), "20260721160000_platform_jobs_foundation");
});

test("production runtime refuses cursor-secret and handler test overrides", () => {
  const original = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, value: "production", writable: true });
  try {
    assert.throws(() => setPlatformJobCursorSigningSecretForTests(secret), /unavailable/u);
    assert.throws(() => setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE", async () => ({ errorCode: "PERMANENT_FAILURE", outcome: "FAILED", retryable: false })), /unavailable/u);
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, value: original, writable: true });
  }
});

test("Gate 6A staging safety requires exact environment, encrypted database, and healthy 43/43", async () => {
  const environment = { NODE_ENV: "test", REZNO_ENV: "staging", REZNO_STAGE6_GATE6A_CONFIRM: PLATFORM_JOBS_GATE6A_CONFIRMATION } as NodeJS.ProcessEnv;
  const calls = [
    [{ database: "rezno_staging", encrypted: true, user: "rezno_staging_owner" }],
    [{ applied: BigInt(43), failed: BigInt(0), rolledBack: BigInt(0), total: BigInt(43) }],
  ];
  assert.deepEqual(await assertPlatformJobsGate6aStaging({ $queryRaw: async () => calls.shift() } as never, environment), {
    database: "rezno_staging", encrypted: true, migrations: "43/43", role: "rezno_staging_owner", rolledBack: 0,
  });
  await assert.rejects(assertPlatformJobsGate6aStaging({ $queryRaw: async () => [{ database: "rezno_production", encrypted: true, user: "owner" }] } as never, environment), /rezno_staging/u);
  let unencryptedCalls = 0;
  await assert.rejects(assertPlatformJobsGate6aStaging({ $queryRaw: async () => {
    unencryptedCalls += 1;
    return unencryptedCalls === 1 ? [{ database: "rezno_staging", encrypted: false, user: "owner" }] : [];
  } } as never, environment), /encrypted/u);
  const localCalls = [
    [{ database: "rezno_staging", encrypted: false, user: "postgres" }],
    [{ applied: BigInt(43), failed: BigInt(0), rolledBack: BigInt(0), total: BigInt(43) }],
  ];
  assert.deepEqual(await assertPlatformJobsGate6aStaging({ $queryRaw: async () => localCalls.shift() } as never, {
    ...environment,
    DATABASE_URL: "postgresql://postgres:local-only@127.0.0.1:55436/rezno_staging",
    REZNO_STAGE6_GATE6A_ALLOW_LOCAL_UNENCRYPTED: "true",
  }), {
    database: "rezno_staging", encrypted: false, migrations: "43/43", role: "postgres", rolledBack: 0,
  });
  await assert.rejects(assertPlatformJobsGate6aStaging({ $queryRaw: async () => [{ database: "rezno_staging", encrypted: false, user: "neondb_owner" }] } as never, {
    ...environment,
    DATABASE_URL: "postgresql://neondb_owner:secret@ep-example.neon.tech/rezno_staging",
    REZNO_STAGE6_GATE6A_ALLOW_LOCAL_UNENCRYPTED: "true",
  }), /encrypted/u);
  const neonProxyCalls = [
    [{ database: "rezno_staging", encrypted: false, user: "neondb_owner" }],
    [{ applied: BigInt(43), failed: BigInt(0), rolledBack: BigInt(0), total: BigInt(43) }],
  ];
  assert.deepEqual(await assertPlatformJobsGate6aStaging({ $queryRaw: async () => neonProxyCalls.shift() } as never, {
    ...environment,
    DATABASE_URL: "postgresql://neondb_owner:secret@ep-example.neon.tech/rezno_staging?sslmode=verify-full",
  }), {
    database: "rezno_staging", encrypted: true, migrations: "43/43", role: "neondb_owner", rolledBack: 0,
  });
  await assert.rejects(assertPlatformJobsGate6aStaging({ $queryRaw: async () => [{ database: "rezno_staging", encrypted: false, user: "neondb_owner" }] } as never, {
    ...environment,
    DATABASE_URL: "postgresql://neondb_owner:secret@ep-example-pooler.neon.tech/rezno_staging?sslmode=verify-full",
  }), /encrypted/u);
  await assert.rejects(assertPlatformJobsGate6aStaging({ $queryRaw: async () => [{ database: "rezno_staging", encrypted: false, user: "neondb_owner" }] } as never, {
    ...environment,
    DATABASE_URL: "postgresql://neondb_owner:secret@ep-example.neon.tech/rezno_staging?sslmode=require",
  }), /encrypted/u);
  let unhealthyCalls = 0;
  await assert.rejects(assertPlatformJobsGate6aStaging({ $queryRaw: async () => {
    unhealthyCalls += 1;
    return unhealthyCalls === 1
      ? [{ database: "rezno_staging", encrypted: true, user: "owner" }]
      : [{ applied: BigInt(42), failed: BigInt(1), rolledBack: BigInt(0), total: BigInt(43) }];
  } } as never, environment), /43\/43/u);
});

function code(expected: string) {
  return (error: unknown) => error instanceof PlatformJobDomainError && error.code === expected;
}
