import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AI_GATE_B_DEFAULT_MODEL,
  AI_GATE_B_GEMINI_ORIGIN,
  AiGateBProviderError,
  runAiGateBCustomerDiscovery,
  toAiGateBMarketplaceResults,
  toPublicAiGateBResponse,
  type AiGateBEnv,
  type AiGateBProviderInput,
} from "../../../features/ai/gate-b";
import {
  AI_GATE_C_APPROVED_PROVIDER,
  AI_GATE_C_PROVIDER_CONFIG_VERSION,
  __createAiGateCMemoryCircuitBackendForTests,
  __classifyAiGateCPostgresCircuitRowForTests,
  createAiGateCControlledGeminiProvider,
  getAiGateCDeploymentPosture,
  getAiGateCClientReadiness,
  getAiGateCProviderReadiness,
  getAiGateCProviderRegistry,
  isApprovedAiGateCModel,
  type AiGateCProviderTelemetry,
} from "../../../features/ai/provider-operations";
import { __setAiGateBBudgetTestHooks, acquireAiGateCProviderBudget } from "../../../features/ai/rate-limit";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

const gateCEnv = {
  NODE_ENV: "test",
  REZNO_AI_DEPLOYMENT_ENV: "local",
  REZNO_AI_ENABLED: "true",
  REZNO_AI_GEMINI_ENABLED: "true",
  REZNO_AI_GATE_C_ENABLED: "true",
  REZNO_AI_GATE_C_LOCAL_PROVIDER_ENABLED: "true",
  REZNO_AI_KILL_SWITCH: "false",
  GEMINI_API_KEY: "test-gemini-secret",
  GEMINI_MODEL: AI_GATE_B_DEFAULT_MODEL,
} satisfies AiGateBEnv;

const marketplaceBusiness = {
  id: "8b0f4d2e-1111-4111-8111-111111111111",
  slug: "sunrise-family-restaurant",
  name: "Sunrise Family Restaurant",
  description: "Family friendly public marketplace description.",
  city: "Erbil",
  categoryName: "Restaurant",
  matchingServiceName: "Breakfast",
  startingPrice: "12.00",
  averageRating: 4.6,
  reviewCount: 18,
  serviceCount: 4,
  vertical: "RESTAURANT" as const,
  hasMenu: true,
  hasTables: true,
};

function providerInput(): AiGateBProviderInput {
  return {
    locale: "en",
    normalizedQuestion: "Find a family restaurant in Erbil",
    intent: { query: "family restaurant", city: "Erbil", vertical: "RESTAURANT" },
    results: toAiGateBMarketplaceResults([marketplaceBusiness]),
  };
}

function successfulGeminiResponse() {
  return new Response(JSON.stringify({
    output_text: JSON.stringify({
      status: "ANSWER",
      answer: "Sunrise is grounded by the public restaurant result.",
      items: [{ citationId: "marketplace_1", title: "Sunrise", reason: "Public restaurant result." }],
    }),
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

test("Gate C provider registry and readiness are closed by default, posture-aware, and model-allowlisted", () => {
  assert.deepEqual(getAiGateCProviderRegistry().gemini.id, AI_GATE_C_APPROVED_PROVIDER);
  assert.equal(isApprovedAiGateCModel(AI_GATE_B_DEFAULT_MODEL), true);
  assert.equal(isApprovedAiGateCModel("gemini-anything-else"), false);

  assert.equal(getAiGateCProviderReadiness({}).enabled, false);
  assert.equal(getAiGateCProviderReadiness({ ...gateCEnv }).reason, "READY");
  assert.deepEqual(getAiGateCClientReadiness({ ...gateCEnv }), {
    enabled: true,
    readiness: "configured",
  });
  assert.deepEqual(Object.keys(getAiGateCClientReadiness({ ...gateCEnv })).sort(), ["enabled", "readiness"]);
  assert.equal(getAiGateCProviderReadiness({ ...gateCEnv, REZNO_AI_KILL_SWITCH: "true" }).reason, "KILL_SWITCH_ACTIVE");
  assert.equal(getAiGateCProviderReadiness({ ...gateCEnv, REZNO_AI_GATE_C_ENABLED: undefined }).reason, "GATE_C_DISABLED");
  assert.equal(getAiGateCProviderReadiness({ ...gateCEnv, GEMINI_API_KEY: undefined }).reason, "MISSING_GEMINI_KEY");
  assert.equal(getAiGateCProviderReadiness({ ...gateCEnv, GEMINI_MODEL: "gemini-3.6-pro" }).reason, "INVALID_GEMINI_MODEL");
  assert.equal(getAiGateCProviderReadiness({
    ...gateCEnv,
    REZNO_AI_DEPLOYMENT_ENV: "staging",
    REZNO_AI_GATE_C_LOCAL_PROVIDER_ENABLED: "true",
    REZNO_AI_GATE_C_STAGING_APPROVED: undefined,
  }).reason, "ENVIRONMENT_NOT_APPROVED");
  assert.equal(getAiGateCProviderReadiness({
    ...gateCEnv,
    REZNO_AI_DEPLOYMENT_ENV: "production",
    REZNO_AI_GATE_C_PRODUCTION_APPROVED: undefined,
  }).reason, "ENVIRONMENT_NOT_APPROVED");
});

test("Gate C rejects unknown or conflicting deployment environments before provider work", async () => {
  const invalidCases: Array<{ readonly name: string; readonly env: AiGateBEnv }> = [
    { name: "unknown REZNO_AI_DEPLOYMENT_ENV", env: { REZNO_AI_DEPLOYMENT_ENV: "qa" } },
    { name: "unknown REZNO_DEPLOYMENT_ENV", env: { REZNO_DEPLOYMENT_ENV: "qa" } },
    { name: "unknown VERCEL_ENV", env: { VERCEL_ENV: "qa" } },
    { name: "illegal casing", env: { REZNO_AI_DEPLOYMENT_ENV: "Local" } },
    { name: "illegal whitespace", env: { REZNO_AI_DEPLOYMENT_ENV: " local " } },
    { name: "empty explicit value", env: { REZNO_AI_DEPLOYMENT_ENV: "" } },
    { name: "explicit conflict", env: { REZNO_AI_DEPLOYMENT_ENV: "local", REZNO_DEPLOYMENT_ENV: "production" } },
    { name: "Vercel production cannot be downgraded", env: { REZNO_AI_DEPLOYMENT_ENV: "local", VERCEL_ENV: "production" } },
    { name: "Vercel preview cannot be downgraded", env: { REZNO_AI_DEPLOYMENT_ENV: "local", VERCEL_ENV: "preview" } },
  ];
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return successfulGeminiResponse();
  }) as typeof fetch;
  try {
    for (const { name, env } of invalidCases) {
      const readiness = getAiGateCProviderReadiness({ ...gateCEnv, ...env });
      assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, ...env }), "invalid", name);
      assert.equal(readiness.enabled, false, name);
      assert.equal(readiness.reason, "INVALID_DEPLOYMENT_ENV", name);
      const provider = createAiGateCControlledGeminiProvider({
        personId: "person_a",
        env: { ...gateCEnv, ...env },
        circuitBackend: __createAiGateCMemoryCircuitBackendForTests(),
      });
      await assert.rejects(async () => provider.complete(providerInput()), (error) => {
        assert.equal(error instanceof AiGateBProviderError, true, name);
        if (error instanceof AiGateBProviderError) {
          assert.equal(error.providerRequestCount, 0, name);
        }
        return true;
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual({
    input: "qa",
    enabled: getAiGateCProviderReadiness({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: "qa" }).enabled,
    reason: getAiGateCProviderReadiness({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: "qa" }).reason,
    providerCalls,
    providerRequestCount: 0,
  }, {
    input: "qa",
    enabled: false,
    reason: "INVALID_DEPLOYMENT_ENV",
    providerCalls: 0,
    providerRequestCount: 0,
  });

  assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: "local" }), "local");
  assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: undefined, REZNO_DEPLOYMENT_ENV: "staging" }), "staging");
  assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: "production" }), "production");
  assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, VERCEL_ENV: "development" }), "local");
  assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: undefined, VERCEL_ENV: "preview", REZNO_DEPLOYMENT_ENV: "staging" }), "staging");
  assert.equal(getAiGateCDeploymentPosture({ ...gateCEnv, REZNO_AI_DEPLOYMENT_ENV: undefined, VERCEL_ENV: "production", REZNO_DEPLOYMENT_ENV: "production" }), "production");
});

test("Gate C budgets consume per-Person, daily, service, and concurrency scopes before provider work", async () => {
  const consumed: string[] = [];
  const active = new Set<string>();
  let acquired = 0;
  let releases = 0;
  __setAiGateBBudgetTestHooks({
    async consumeRateLimit(scope, identifier) {
      consumed.push(`${scope}:${identifier}`);
      return { success: true, retryAfterSeconds: 0, unavailable: false };
    },
    concurrencyBackend: {
      async acquire(identifier) {
        acquired += 1;
        if (active.has(identifier)) return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 1 };
        active.add(identifier);
        return {
          ok: true,
          async release() {
            releases += 1;
            active.delete(identifier);
          },
        };
      },
    },
  });
  try {
    const first = await acquireAiGateCProviderBudget("person_a");
    assert.equal(first.ok, true);
    assert.deepEqual(consumed, [
      "ai.gate-c.person.window:person:person_a",
      "ai.gate-c.person.daily:person:person_a",
      "ai.gate-c.service.window:service:gemini-free-tier",
      "ai.gate-c.service.daily:service:gemini-free-tier",
    ]);
    assert.equal(acquired, 1);
    const duplicate = await acquireAiGateCProviderBudget("person_a");
    assert.deepEqual(duplicate, { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 1 });
    if (first.ok) {
      await first.release();
      await first.release();
    }
    assert.equal(releases, 1);
  } finally {
    __setAiGateBBudgetTestHooks();
  }
});

test("Gate C budgets fail closed when the distributed store is unavailable and never acquire concurrency", async () => {
  let acquired = 0;
  __setAiGateBBudgetTestHooks({
    async consumeRateLimit() {
      return { success: false, retryAfterSeconds: 1, unavailable: true };
    },
    concurrencyBackend: {
      async acquire() {
        acquired += 1;
        return { ok: true, async release() {} };
      },
    },
  });
  try {
    assert.deepEqual(await acquireAiGateCProviderBudget("person_unavailable"), {
      ok: false,
      code: "UNAVAILABLE",
      retryAfterSeconds: 1,
    });
    assert.equal(acquired, 0);
  } finally {
    __setAiGateBBudgetTestHooks();
  }
});

test("Gate C controlled provider sends the key only in x-goog-api-key and emits safe telemetry", async () => {
  const calls: Array<{ readonly url: string; readonly headers: Headers; readonly body: string }> = [];
  const telemetry: AiGateCProviderTelemetry[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    });
    return successfulGeminiResponse();
  }) as typeof fetch;
  try {
    const provider = createAiGateCControlledGeminiProvider({
      personId: "person_a",
      env: gateCEnv,
      correlationId: "ai_gate_c_test_correlation",
      circuitBackend: __createAiGateCMemoryCircuitBackendForTests(),
      telemetrySink(event) {
        telemetry.push(event);
      },
    });
    await provider.complete(providerInput());
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `${AI_GATE_B_GEMINI_ORIGIN}/v1beta/interactions`);
  assert.equal(calls[0]?.url.includes(gateCEnv.GEMINI_API_KEY), false);
  assert.equal(calls[0]?.headers.get("x-goog-api-key"), gateCEnv.GEMINI_API_KEY);
  assert.match(calls[0]?.body ?? "", /marketplace_1/);
  assert.doesNotMatch(calls[0]?.body ?? "", /8b0f4d2e-1111-4111-8111-111111111111|businessId|person_a|Organization|Owner/);
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0]?.providerRequestCount, 1);
  assert.equal(telemetry[0]?.providerConfigurationVersion, AI_GATE_C_PROVIDER_CONFIG_VERSION);
  assert.equal(telemetry[0]?.correlationId, "ai_gate_c_test_correlation");
  const serializedTelemetry = JSON.stringify(telemetry);
  assert.doesNotMatch(serializedTelemetry, /test-gemini-secret|Find a family restaurant|Sunrise Family Restaurant|8b0f4d2e|person_a/);
});

test("Gate C kill switch and invalid model stop before any Gemini network call", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return successfulGeminiResponse();
  }) as typeof fetch;
  try {
    const killed = createAiGateCControlledGeminiProvider({
      personId: "person_a",
      env: { ...gateCEnv, REZNO_AI_KILL_SWITCH: "true" },
      circuitBackend: __createAiGateCMemoryCircuitBackendForTests(),
    });
    await assert.rejects(() => killed.complete(providerInput()), AiGateBProviderError);
    const invalidModel = createAiGateCControlledGeminiProvider({
      personId: "person_a",
      env: { ...gateCEnv, GEMINI_MODEL: "gemini-3.6-pro" },
      circuitBackend: __createAiGateCMemoryCircuitBackendForTests(),
    });
    await assert.rejects(() => invalidModel.complete(providerInput()), AiGateBProviderError);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
});

test("Gate C circuit breaker opens, half-opens one probe, and fences old generations", async () => {
  let now = 1_000;
  const backend = __createAiGateCMemoryCircuitBackendForTests({
    failureThreshold: 2,
    openMs: 100,
    now: () => now,
  });
  const circuitInput = {
    provider: AI_GATE_C_APPROVED_PROVIDER,
    modelId: AI_GATE_B_DEFAULT_MODEL,
    configurationVersion: AI_GATE_C_PROVIDER_CONFIG_VERSION,
  } as const;

  const old = await backend.acquire(circuitInput);
  const peer = await backend.acquire(circuitInput);
  assert.equal(old.ok, true);
  assert.equal(peer.ok, true);
  if (!old.ok || !peer.ok) throw new Error("expected closed permits");
  await old.recordFailure({ code: "UNAVAILABLE" });
  await old.recordFailure({ code: "TIMEOUT" });
  await peer.recordSuccess();
  const opened = await backend.acquire(circuitInput);
  assert.equal(opened.ok, false);
  if (opened.ok) throw new Error("expected open circuit");
  assert.equal(opened.state, "OPEN");

  now += 101;
  const halfOpen = await backend.acquire(circuitInput);
  assert.equal(halfOpen.ok, true);
  if (!halfOpen.ok) throw new Error("expected half-open probe");
  assert.equal(halfOpen.state, "HALF_OPEN");
  const secondProbe = await backend.acquire(circuitInput);
  assert.equal(secondProbe.ok, false);
  await halfOpen.recordSuccess();
  await halfOpen.release();
  const closed = await backend.acquire(circuitInput);
  assert.equal(closed.ok, true);
  if (closed.ok) assert.equal(closed.state, "CLOSED");
});

test("Gate C PostgreSQL circuit classification opens at the exact failure threshold", () => {
  const now = Date.parse("2026-07-28T12:00:00.000Z");
  const updatedAt = new Date("2026-07-28T11:59:59.000Z");
  assert.deepEqual(
    __classifyAiGateCPostgresCircuitRowForTests(null, now),
    { state: "CLOSED", generation: "empty" },
  );
  assert.equal(
    __classifyAiGateCPostgresCircuitRowForTests({
      count: 1,
      resetAt: new Date(now + 30_000),
      updatedAt,
    }, now).state,
    "CLOSED",
  );
  const open = __classifyAiGateCPostgresCircuitRowForTests({
    count: 2,
    resetAt: new Date(now + 30_000),
    updatedAt,
  }, now);
  assert.equal(open.state, "OPEN");
  if (open.state === "OPEN") assert.equal(open.retryAfterSeconds, 30);
  assert.equal(
    __classifyAiGateCPostgresCircuitRowForTests({
      count: 2,
      resetAt: new Date(now - 1),
      updatedAt,
    }, now).state,
    "HALF_OPEN",
  );
});

test("Gate C invalid key or permission errors open the circuit without retry storm, while quota does not", async () => {
  const backend = __createAiGateCMemoryCircuitBackendForTests();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("denied", { status: 403 });
  }) as typeof fetch;
  try {
    const denied = createAiGateCControlledGeminiProvider({
      personId: "person_a",
      env: gateCEnv,
      circuitBackend: backend,
    });
    await assert.rejects(() => denied.complete(providerInput()), /PERMISSION_DENIED/);
    const blocked = createAiGateCControlledGeminiProvider({
      personId: "person_a",
      env: gateCEnv,
      circuitBackend: backend,
    });
    await assert.rejects(async () => blocked.complete(providerInput()), (error) => {
      assert.equal(error instanceof AiGateBProviderError, true);
      if (error instanceof AiGateBProviderError) {
        assert.equal(error.code, "QUOTA_OR_RATE_LIMITED");
        assert.equal(error.providerRequestCount, 0);
      }
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 1);

  let quotaFetchCalls = 0;
  globalThis.fetch = (async () => {
    quotaFetchCalls += 1;
    return new Response("quota", { status: 429 });
  }) as typeof fetch;
  try {
    const quotaBackend = __createAiGateCMemoryCircuitBackendForTests();
    const quota = createAiGateCControlledGeminiProvider({
      personId: "person_b",
      env: gateCEnv,
      circuitBackend: quotaBackend,
    });
    await assert.rejects(() => quota.complete(providerInput()), /QUOTA_OR_RATE_LIMITED/);
    const retryAfterQuota = await quotaBackend.acquire({
      provider: AI_GATE_C_APPROVED_PROVIDER,
      modelId: AI_GATE_B_DEFAULT_MODEL,
      configurationVersion: AI_GATE_C_PROVIDER_CONFIG_VERSION,
    });
    assert.equal(retryAfterQuota.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(quotaFetchCalls, 1);
});

test("Gate C privacy remains before budget, marketplace search, and provider work", async () => {
  const route = read("app/api/ai/customer/discovery/route.ts");
  const capabilityIndex = route.indexOf("const capability = getAiGateCProviderReadiness()");
  const refusalIndex = route.indexOf("if (shouldRefuseAiGateBQuestion(question))");
  const budgetIndex = route.indexOf("acquireAiGateCProviderBudget(identity.person.id)");
  const providerIndex = route.indexOf("provider: createAiGateCControlledGeminiProvider");
  assert.notEqual(capabilityIndex, -1);
  assert.notEqual(refusalIndex, -1);
  assert.notEqual(budgetIndex, -1);
  assert.notEqual(providerIndex, -1);
  assert.equal(capabilityIndex < budgetIndex, true);
  assert.equal(refusalIndex < budgetIndex, true);
  assert.equal(budgetIndex < providerIndex, true);

  let marketplaceCalls = 0;
  const response = await runAiGateBCustomerDiscovery({
    locale: "en",
    question: "Find a restaurant for dana [at] example [dot] com",
    provider: createAiGateCControlledGeminiProvider({
      personId: "person_a",
      env: gateCEnv,
      circuitBackend: __createAiGateCMemoryCircuitBackendForTests(),
    }),
    env: gateCEnv,
    marketplaceSearch: async () => {
      marketplaceCalls += 1;
      return [marketplaceBusiness];
    },
    skipCapabilityCheck: true,
  });
  assert.equal(response.ok, false);
  assert.equal(response.status, "REFUSAL");
  assert.equal(response.metadata.providerRequestCount, 0);
  assert.equal(marketplaceCalls, 0);
});

test("Gate C public route responses strip model IDs and provider internals from user-visible data", async () => {
  const response = await runAiGateBCustomerDiscovery({
    locale: "en",
    question: "Find a restaurant in Erbil",
    provider: {
      id: "test-double",
      async complete() {
        return {
          status: "ANSWER",
          answer: "Sunrise is grounded by public data.",
          items: [{ citationId: "marketplace_1", title: "Sunrise", reason: "Public restaurant result." }],
        };
      },
    },
    env: gateCEnv,
    marketplaceSearch: async () => [marketplaceBusiness],
    skipCapabilityCheck: true,
  });
  assert.equal(response.ok, true);
  const publicResponse = toPublicAiGateBResponse(response);
  const serialized = JSON.stringify(publicResponse);
  assert.doesNotMatch(serialized, /modelId|gemini-3\.6-flash|GEMINI_API_KEY|test-gemini-secret/);
  assert.match(read("app/api/ai/customer/discovery/route.ts"), /toPublicAiGateBResponse/);
});

test("Gate C documentation and scans keep Stage 8 closure, Gate A/B regression, no Gate D, and no Migration 52", () => {
  const files = [
    "docs/ai/ai-canonical-scope.md",
    "docs/ai/gate-c-canonical-scope.md",
    "docs/ai/gate-c-architecture-control-plane.md",
    "docs/ai/gate-c-threat-model.md",
    "docs/ai/gate-c-evaluation-plan.md",
    "docs/ai/gate-c-test-plan.md",
    "docs/ai/gate-c-secrets-rotation-runbook.md",
    "docs/ai/gate-c-outage-rollback-runbook.md",
    "docs/ai/gate-c-closure-evidence.md",
    "features/ai/provider-operations.ts",
    "features/ai/rate-limit.ts",
    "app/api/ai/customer/discovery/route.ts",
  ];
  const combined = files.map(read).join("\n");
  assert.match(read("docs/ai/ai-canonical-scope.md"), /Gate C:\s+`ACTIVE — AUTHOR IMPLEMENTATION`/);
  assert.match(combined, /Gate A:\s+`CLOSED`|Gate A[\s\S]*CLOSED/);
  assert.match(combined, /Gate B:\s+`CLOSED`|Gate B[\s\S]*CLOSED/);
  assert.match(combined, /c9182bb53b55cb1fa01104db0e92733bcd740e89/);
  assert.match(combined, /CLOSED\s*\/\s*OPEN\s*\/\s*HALF_OPEN/);
  assert.match(combined, /Stage 8 historical closure/i);
  assert.doesNotMatch(combined, /Gate D:\s+`ACTIVE|Migration 52:\s*`CREATED`/i);
  assert.equal(read("prisma/migrations/migration_lock.toml").includes("Migration 52"), false);
});
