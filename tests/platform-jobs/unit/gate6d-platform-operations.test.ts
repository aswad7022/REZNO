import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import type { JWTPayload } from "jose";

import {
  authorizedPlatformJobTypes,
  requiredPlatformJobPermissions,
  requiredPlatformSchedulePermissions,
} from "../../../features/platform-jobs/domain/authority";
import {
  PLATFORM_JOB_ALLOWED_TYPES,
  PLATFORM_JOB_LIMITS,
  STAGE_6_ARCHITECTURE,
  platformJobHandlerTimeoutMs,
} from "../../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import {
  parsePlatformJobPayload,
  parsePlatformJobResult,
} from "../../../features/platform-jobs/domain/registry";
import {
  assertNoPlatformOperationsQuery,
  parseAlertListQuery,
  parseIncidentListQuery,
  parseRuntimeState,
} from "../../../features/platform-operations/api/validation";
import {
  decodePlatformOperationsCursor,
  encodePlatformOperationsCursor,
  platformOperationsCursorBinding,
  setPlatformOperationsCursorSigningSecretForTests,
} from "../../../features/platform-operations/domain/cursor";
import {
  PLATFORM_SCHEDULE_REGISTRY_SIZE,
} from "../../../features/platform-operations/services/admin";
import {
  RuntimeIdentityError,
  validateGitHubRuntimeClaims,
} from "../../../features/platform-operations/services/github-oidc";
import {
  assertCommunicationsPaymentGate6cStaging,
  COMMUNICATIONS_PAYMENT_GATE6C_CONFIRMATION,
} from "../../../scripts/staging/communications-payment-gate6c-safety";
import {
  assertPlatformOperationsGate6dStaging,
  PLATFORM_OPERATIONS_GATE6D_CONFIRMATION,
} from "../../../scripts/staging/platform-operations-gate6d-safety";

const strongSecret =
  "gate6d-platform-operations-cursor-secret-2026-A9!zQ7#mV4";
const deployedSha = "a".repeat(40);

test.before(() => {
  setPlatformOperationsCursorSigningSecretForTests(strongSecret);
});

test.after(() => {
  setPlatformOperationsCursorSigningSecretForTests(undefined);
});

test("Gate 6D closes the exact 23-job and 13-schedule registries", () => {
  assert.equal(PLATFORM_JOB_ALLOWED_TYPES.length, 23);
  assert.equal(new Set(PLATFORM_JOB_ALLOWED_TYPES).size, 23);
  assert.equal(PLATFORM_SCHEDULE_REGISTRY_SIZE, 13);
  assert.equal(STAGE_6_ARCHITECTURE.gates.gate6A, "ACCEPTED");
  assert.equal(STAGE_6_ARCHITECTURE.gates.gate6B, "ACCEPTED");
  assert.equal(STAGE_6_ARCHITECTURE.gates.gate6C, "ACCEPTED");
  assert.equal(STAGE_6_ARCHITECTURE.gates.gate6D, "ACTIVE");

  assert.deepEqual(
    requiredPlatformJobPermissions("COMMERCE_ORDER_EXPIRY"),
    ["PLATFORM_JOBS_MANAGE", "COMMERCE_ORDERS_MANAGE"],
  );
  assert.deepEqual(
    requiredPlatformJobPermissions("PLATFORM_OPERATIONS_MONITOR"),
    ["PLATFORM_JOBS_MANAGE", "PLATFORM_OPERATIONS_MANAGE"],
  );
  assert.deepEqual(
    requiredPlatformSchedulePermissions("DISTRIBUTED_RATE_LIMIT_CLEANUP"),
    ["PLATFORM_JOBS_MANAGE", "PLATFORM_OPERATIONS_MANAGE"],
  );
  assert.equal(
    authorizedPlatformJobTypes([
      "PLATFORM_JOBS_MANAGE",
      "PLATFORM_OPERATIONS_MANAGE",
    ]).includes("COMMERCE_ORDER_EXPIRY"),
    false,
  );
  assert.equal(
    authorizedPlatformJobTypes([
      "PLATFORM_JOBS_MANAGE",
      "PLATFORM_OPERATIONS_MANAGE",
    ]).includes("PLATFORM_OPERATIONS_MONITOR"),
    true,
  );
  for (const jobType of [
    "STORAGE_ORPHAN_CLEANUP",
    "STORAGE_ASSET_DELETE_RETRY",
    "STORAGE_ASSET_RESCAN",
    "MEDIA_RENDITION_GENERATE",
    "MEDIA_RENDITION_DELETE",
  ] as const) {
    assert.equal(platformJobHandlerTimeoutMs(jobType), 15_000);
    assert.ok(
      platformJobHandlerTimeoutMs(jobType)
        < PLATFORM_JOB_LIMITS.minLeaseSeconds * 1_000,
    );
  }
  assert.equal(
    platformJobHandlerTimeoutMs("STORAGE_MAINTENANCE_DISCOVERY"),
    PLATFORM_JOB_LIMITS.executionTimeoutMs,
  );
});

test("Gate 6D payload and result contracts are strict and bounded", () => {
  assert.deepEqual(
    parsePlatformJobPayload("COMMERCE_ORDER_EXPIRY", 1, { batchSize: 50 }),
    { batchSize: 50 },
  );
  assert.deepEqual(
    parsePlatformJobPayload("PLATFORM_OPERATIONS_MONITOR", 1, { version: 1 }),
    { version: 1 },
  );
  assert.deepEqual(
    parsePlatformJobPayload("DISTRIBUTED_RATE_LIMIT_CLEANUP", 1, {
      batchSize: 500,
    }),
    { batchSize: 500 },
  );
  assert.throws(
    () => parsePlatformJobPayload("COMMERCE_ORDER_EXPIRY", 1, { batchSize: 51 }),
    domainCode("VALIDATION_ERROR"),
  );
  assert.throws(
    () => parsePlatformJobPayload(
      "PLATFORM_OPERATIONS_MONITOR",
      1,
      { version: 1, url: "https://example.invalid" },
    ),
    domainCode("VALIDATION_ERROR"),
  );
  assert.deepEqual(
    parsePlatformJobResult("DISTRIBUTED_RATE_LIMIT_CLEANUP", {
      deleted: 2,
      kind: "DISTRIBUTED_RATE_LIMIT_BUCKETS_CLEANED",
      scanned: 2,
    }),
    {
      deleted: 2,
      kind: "DISTRIBUTED_RATE_LIMIT_BUCKETS_CLEANED",
      scanned: 2,
    },
  );
});

test("platform operations cursors authenticate exact microseconds and scope", () => {
  const id = randomUUID();
  const expected = {
    adminScope: platformOperationsCursorBinding({ admin: "one" }),
    filter: platformOperationsCursorBinding({ state: "OPEN" }),
    pageSize: 20,
  };
  const encoded = encodePlatformOperationsCursor("PLATFORM_ALERT", {
    ...expected,
    id,
    snapshot: "2026-07-24T12:00:00.999999Z",
    sortValue: "2026-07-24T12:00:00.123456Z",
  });
  assert.equal(
    decodePlatformOperationsCursor(
      "PLATFORM_ALERT",
      encoded,
      expected,
      "2026-07-24T12:00:01.000001Z",
    ).sortValue,
    "2026-07-24T12:00:00.123456Z",
  );
  const envelope = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  envelope.id = randomUUID();
  const tampered = Buffer.from(JSON.stringify(envelope), "utf8")
    .toString("base64url");
  assert.throws(
    () => decodePlatformOperationsCursor(
      "PLATFORM_ALERT",
      tampered,
      expected,
      "2026-07-24T12:00:01.000001Z",
    ),
    domainCode("INVALID_CURSOR"),
  );
  assert.throws(
    () => decodePlatformOperationsCursor(
      "PLATFORM_INCIDENT",
      encoded,
      expected,
      "2026-07-24T12:00:01.000001Z",
    ),
    domainCode("INVALID_CURSOR"),
  );
});

test("cursor signing rejects padded and low-entropy secrets", () => {
  const value = {
    adminScope: "a".repeat(64),
    filter: "b".repeat(64),
    id: randomUUID(),
    pageSize: 1,
    snapshot: "2026-07-24T12:00:00.000002Z",
    sortValue: "2026-07-24T12:00:00.000001Z",
  };
  for (const secret of [`${strongSecret} `, "x".repeat(64), "short"]) {
    setPlatformOperationsCursorSigningSecretForTests(secret);
    assert.throws(
      () => encodePlatformOperationsCursor("PLATFORM_ALERT", value),
      /signing is unavailable/u,
    );
  }
  setPlatformOperationsCursorSigningSecretForTests(strongSecret);
});

test("GitHub OIDC claims bind repository, workflow, event, ref, and deployed SHA", () => {
  const claims = validClaims();
  const identity = validateGitHubRuntimeClaims(claims, {
    NODE_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: deployedSha,
  });
  assert.equal(identity.repositorySha, deployedSha);
  assert.match(identity.tokenJtiHash, /^[0-9a-f]{64}$/u);
  assert.equal(identity.eventName, "schedule");

  for (const changed of [
    { ...claims, repository_id: "1" },
    { ...claims, repository: "aswad7022/other" },
    { ...claims, workflow_ref: "aswad7022/REZNO/.github/workflows/other.yml@refs/heads/main" },
    { ...claims, ref: "refs/heads/feature" },
    { ...claims, event_name: "workflow_dispatch" },
    { ...claims, sub: "repo:aswad7022/REZNO:pull_request" },
    { ...claims, jti: "short" },
  ]) {
    assert.throws(
      () => validateGitHubRuntimeClaims(changed, {
        NODE_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: deployedSha,
      }),
      runtimeCode("INVALID_IDENTITY"),
    );
  }
  assert.throws(
    () => validateGitHubRuntimeClaims(claims, {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    }),
    runtimeCode("INVALID_IDENTITY"),
  );
  assert.throws(
    () => validateGitHubRuntimeClaims(claims, { NODE_ENV: "production" }),
    runtimeCode("IDENTITY_UNAVAILABLE"),
  );
});

test("Admin query and mutation inputs reject unknown, duplicate, and changed fields", () => {
  assert.doesNotThrow(
    () => assertNoPlatformOperationsQuery(
      new URL("https://rezno.invalid/api/admin/platform-operations/overview"),
    ),
  );
  assert.throws(
    () => assertNoPlatformOperationsQuery(
      new URL("https://rezno.invalid/api/admin/platform-operations/overview?x=1"),
    ),
    domainCode("VALIDATION_ERROR"),
  );
  assert.deepEqual(
    parseAlertListQuery(
      new URL(
        "https://rezno.invalid/api/admin/platform-operations/alerts?limit=20&state=OPEN&severity=CRITICAL&domain=PLATFORM",
      ),
    ),
    {
      cursor: undefined,
      domain: "PLATFORM",
      limit: 20,
      severity: "CRITICAL",
      state: "OPEN",
    },
  );
  assert.throws(
    () => parseIncidentListQuery(
      new URL(
        "https://rezno.invalid/api/admin/platform-operations/incidents?limit=1&limit=2",
      ),
    ),
    domainCode("VALIDATION_ERROR"),
  );
  assert.deepEqual(
    parseRuntimeState({
      enabled: true,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    }).enabled,
    true,
  );
  assert.throws(
    () => parseRuntimeState({
      arbitrary: true,
      enabled: true,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    }),
    domainCode("VALIDATION_ERROR"),
  );
});

test("runtime workflow uses GitHub-provided OIDC variables and never stores a bearer secret", async () => {
  const source = await readFile(
    new URL("../../../.github/workflows/platform-runtime.yml", import.meta.url),
    "utf8",
  );
  assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/u);
  assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_URL/u);
  assert.match(source, /audience=rezno-platform-runtime/u);
  assert.match(source, /id-token: write/u);
  assert.doesNotMatch(source, /\$\{TOKEN_REQUEST_(?:TOKEN|URL)\}/u);
  assert.doesNotMatch(source, /secrets\./u);
});

test("Gate 6D staging safety requires exact 49/49 loopback or attested direct Neon identity", async () => {
  const environment: NodeJS.ProcessEnv = {
    DATABASE_URL:
      "postgresql://rezno@127.0.0.1/rezno_staging?sslmode=disable",
    NODE_ENV: "test",
    REZNO_ENV: "staging",
    REZNO_STAGE6_GATE6D_ALLOW_LOCAL_UNENCRYPTED: "true",
    REZNO_STAGE6_GATE6D_CONFIRM:
      PLATFORM_OPERATIONS_GATE6D_CONFIRMATION,
  };
  const safety = await assertPlatformOperationsGate6dStaging(
    gate6dSafetyClient(49),
    environment,
  );
  assert.deepEqual(safety, {
    backendPgStatSsl: false,
    clientTlsVerified: false,
    database: "rezno_staging",
    encrypted: false,
    hostnameVerified: false,
    migrations: "49/49",
    prismaUsedAttestedPhysicalClient: false,
    role: "rezno",
    rolledBack: 0,
    tlsProtocol: null,
    transport: "LOCAL_TEST_TCP",
    transportConfigurationSha256: null,
  });
  await assert.rejects(
    assertPlatformOperationsGate6dStaging(
      gate6dSafetyClient(48),
      environment,
    ),
    /49\/49/u,
  );
  await assert.rejects(
    assertPlatformOperationsGate6dStaging(
      gate6dSafetyClient(49),
      { ...environment, REZNO_STAGE6_GATE6D_CONFIRM: "wrong" },
    ),
    /confirmation marker/u,
  );
  await assert.rejects(
    assertPlatformOperationsGate6dStaging(
      gate6dSafetyClient(49),
      { ...environment, NODE_ENV: "production" },
    ),
    /non-production staging/u,
  );
});

test("accepted Gate 6C staging safety admits 49/49 only as an exact Gate 6D successor", async () => {
  const environment: NodeJS.ProcessEnv = {
    DATABASE_URL:
      "postgresql://rezno@127.0.0.1/rezno_staging?sslmode=disable",
    NODE_ENV: "test",
    REZNO_ENV: "staging",
    REZNO_STAGE6_GATE6C_ALLOW_LOCAL_UNENCRYPTED: "true",
    REZNO_STAGE6_GATE6C_CONFIRM:
      COMMUNICATIONS_PAYMENT_GATE6C_CONFIRMATION,
    REZNO_STAGE6_GATE6D_CONFIRM:
      PLATFORM_OPERATIONS_GATE6D_CONFIRMATION,
    REZNO_STAGE6_GATE6D_SUCCESSOR: "true",
  };
  const result = await assertCommunicationsPaymentGate6cStaging(
    gate6dSafetyClient(49),
    environment,
  );
  assert.equal(result.migrations, "49/49");
  await assert.rejects(
    assertCommunicationsPaymentGate6cStaging(
      gate6dSafetyClient(49),
      { ...environment, REZNO_STAGE6_GATE6D_CONFIRM: "wrong" },
    ),
    /48\/48/u,
  );
});

test("Gate 6D fixture cleanup is exact-ID scoped and retains append-only production triggers", async () => {
  const source = await readFile(
    new URL(
      "../../../scripts/staging/platform-operations-gate6d-fixture.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /assertFixtureOwnership/u);
  assert.match(source, /actorAdminUserId: ids\.adminUserId/u);
  assert.match(
    source,
    /DISABLE TRIGGER "PlatformOperationMutation_append_only"/u,
  );
  assert.match(
    source,
    /ENABLE TRIGGER "PlatformOperationMutation_append_only"/u,
  );
  assert.doesNotMatch(source, /deleteMany\(\s*\{\s*\}\s*\)/u);
  assert.doesNotMatch(source, /DROP\s+(?:TABLE|TRIGGER|TYPE)/iu);
});

test("Gate 6B retention fixture remains time-stable under the Gate 6D successor", async () => {
  const source = await readFile(
    new URL(
      "../../../scripts/staging/storage-media-gate6b-fixture.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /REZNO_STAGE6_GATE6D_SUCCESSOR === "true"/u);
  assert.match(
    source,
    /REZNO_STAGE6_GATE6D_CONFIRM\s*=== "REZNO_STAGE6_GATE6D_STAGING_ONLY"/u,
  );
  assert.match(
    source,
    /rollingRetentionSuccessor = gate6cSuccessor \|\| gate6dSuccessor/u,
  );
  assert.match(
    source,
    /rollingRetentionSuccessor\s*\?\s*successorUtcDay/u,
  );
});

test("Stage 4C successor smoke requires 49 migrations under Gate 6D", async () => {
  const source = await readFile(
    new URL(
      "../../../scripts/staging/smoke-outbound-communications-stage4c.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /REZNO_STAGE6_GATE6D_SUCCESSOR === "true"/u);
  assert.match(
    source,
    /REZNO_STAGE6_GATE6D_CONFIRM === "REZNO_STAGE6_GATE6D_STAGING_ONLY"/u,
  );
  assert.match(
    source,
    /expectedMigrations = gate6dSuccessor \? 49 : gate6cSuccessor \? 48 : 38/u,
  );
  assert.match(
    source,
    /automationSuccessor = gate6cSuccessor \|\| gate6dSuccessor/u,
  );
  assert.match(source, /transient, automationSuccessor \? 0 : 1/u);
});

test("Gate 6C successor smoke drains the exact Stage 4C transient retry within a fixed discovery bound", async () => {
  const source = await readFile(
    new URL(
      "../../../scripts/staging/smoke-communications-payment-gate6c.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /stage4cTransientRetryCount/u);
  assert.match(source, /STAGE4C_TRANSIENT_CAMPAIGN_CREATE_KEY/u);
  assert.match(
    source,
    /discovery < 5 && stage4cRetryRemaining > 0/u,
  );
  assert.match(source, /assert\.equal\(stage4cRetryRemaining, 0\)/u);
});

test("Gate 5D retains exact Gate 5C fixture coverage while payment inspection remains read-only under Gate 6D", async () => {
  const [fixtureSource, smokeSource] = await Promise.all([
    readFile(
      new URL(
        "../../../scripts/staging/stage5-closure-fixture.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../scripts/staging/smoke-stage5-closure.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(
    fixtureSource,
    /return gate6cSuccessor \|\| gate6dSuccessor/u,
  );
  assert.match(
    smokeSource,
    /paymentIntents\.length,\s*ids\.payments\.intentIds\.length/u,
  );
  assert.match(smokeSource, /inspectPaymentsGate5cSuccessorEvidence/u);
  assert.doesNotMatch(smokeSource, /automationSuccessor \? 0/u);
});

test("The full HTTP runner isolates server-only tests without replacing standard React", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const commands = packageJson.scripts?.["test:http"]
    ?.split("&&")
    .map((command) => command.trim());

  assert.equal(commands?.length, 3);
  assert.match(
    commands?.[0] ?? "",
    /^NODE_OPTIONS=--conditions=react-server tsx --test\b/u,
  );
  assert.match(commands?.[1] ?? "", /^tsx --test\b/u);
  assert.doesNotMatch(commands?.[1] ?? "", /tests\/notifications\/http/u);
  assert.match(
    commands?.[2] ?? "",
    /^NODE_OPTIONS=--conditions=react-server tsx --test\b/u,
  );
  assert.match(commands?.[2] ?? "", /tests\/notifications\/http\/\*\.test\.ts/u);
});

test("Migration 50 is additive and Migrations 48-49 remain byte-identical", async () => {
  const [migrations, marketplaceWorkflow] = await Promise.all([
    readdir(new URL("../../../prisma/migrations", import.meta.url), {
      withFileTypes: true,
    }),
    readFile(
      new URL(
        "../../../.github/workflows/marketplace-pr-ci.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const migrationDirectories = migrations.filter((entry) =>
    entry.isDirectory()
  );
  assert.equal(migrationDirectories.length, 50);
  assert.match(marketplaceWorkflow, /migration_count" != "50"/u);
  assert.match(marketplaceWorkflow, /Expected 50 migrations/u);
  assert.match(
    marketplaceWorkflow,
    /PLATFORM_OPERATIONS_HTTP_BASE_URL: http:\/\/127\.0\.0\.1:3000/u,
  );
  const migration48 = await readFile(
    new URL(
      "../../../prisma/migrations/20260723180000_communications_payment_automation/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256").update(migration48).digest("hex"),
    "04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192",
  );
  const migration49 = await readFile(
    new URL(
      "../../../prisma/migrations/20260724180000_platform_operations_closure/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    migration49,
    /^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|DROP\s+TABLE|DROP\s+TYPE|TRUNCATE)\b/imu,
  );
});

function gate6dSafetyClient(migrations: number) {
  let call = 0;
  return {
    $queryRaw: async () => {
      call += 1;
      if (call === 1) {
        return [{
          database: "rezno_staging",
          encrypted: false,
          user: "rezno",
        }];
      }
      return [{
        applied: BigInt(migrations),
        failed: BigInt(0),
        rolledBack: BigInt(0),
        total: BigInt(migrations),
      }];
    },
  } as never;
}

function validClaims(): JWTPayload {
  return {
    event_name: "schedule",
    iat: Math.floor(Date.now() / 1_000),
    jti: "gate6d-jti-unique-value-2026",
    ref: "refs/heads/main",
    repository: "aswad7022/REZNO",
    repository_id: "1287643453",
    sha: deployedSha,
    sub: "repo:aswad7022/REZNO:ref:refs/heads/main",
    workflow_ref:
      "aswad7022/REZNO/.github/workflows/platform-runtime.yml@refs/heads/main",
  };
}

function domainCode(code: string) {
  return (error: unknown) => (
    error instanceof PlatformJobDomainError && error.code === code
  );
}

function runtimeCode(code: RuntimeIdentityError["code"]) {
  return (error: unknown) => (
    error instanceof RuntimeIdentityError && error.code === code
  );
}
