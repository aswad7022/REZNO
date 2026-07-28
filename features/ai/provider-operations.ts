import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { PoolClient } from "pg";

import { postgresPool, prisma } from "@/lib/db/prisma";
import { consumeRateLimit, distributedRateLimitKeyHash } from "@/lib/security/rate-limit";

import { AiGateBProviderError, type AiGateBEnv, type AiGateBProvider, type AiGateBProviderInput } from "./gate-b";
import { createGeminiGateBProvider } from "./gemini-provider";

export const AI_GATE_C_PROVIDER_CONFIG_VERSION = "ai-gate-c-provider-config-v1" as const;
export const AI_GATE_C_TELEMETRY_VERSION = "ai-gate-c-telemetry-v1" as const;
export const AI_GATE_C_APPROVED_PROVIDER = "gemini" as const;
export const AI_GATE_C_APPROVED_MODELS = ["gemini-3.6-flash"] as const;
export const AI_GATE_C_MAX_INPUT_TOKENS = 900;
export const AI_GATE_C_MAX_OUTPUT_TOKENS = 700;
const AI_GATE_C_CIRCUIT_FAILURE_LIMIT = 2;
const AI_GATE_C_CIRCUIT_OPEN_MS = 30_000;

export type AiGateCDeploymentPosture = "local" | "staging" | "production";
export type AiGateCReadinessReason =
  | "READY"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "GEMINI_DISABLED"
  | "GATE_C_DISABLED"
  | "ENVIRONMENT_NOT_APPROVED"
  | "MISSING_GEMINI_KEY"
  | "MISSING_GEMINI_MODEL"
  | "INVALID_GEMINI_MODEL";

export type AiGateCReadiness = {
  readonly enabled: boolean;
  readonly reason: AiGateCReadinessReason;
  readonly posture: AiGateCDeploymentPosture;
  readonly provider: typeof AI_GATE_C_APPROVED_PROVIDER;
  readonly configurationVersion: typeof AI_GATE_C_PROVIDER_CONFIG_VERSION;
  readonly configured: boolean;
  readonly secretConfigured: boolean;
  readonly modelConfigured: boolean;
  readonly modelId: (typeof AI_GATE_C_APPROVED_MODELS)[number] | null;
};

export type AiGateCClientReadiness = {
  readonly enabled: boolean;
  readonly readiness: "configured" | "not-configured";
};

export type AiGateCCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type AiGateCProviderTelemetry = {
  readonly telemetryVersion: typeof AI_GATE_C_TELEMETRY_VERSION;
  readonly outcome:
    | "SUCCESS"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "UNAVAILABLE"
    | "PERMISSION_DENIED"
    | "INVALID_KEY"
    | "MALFORMED_OUTPUT"
    | "SAFETY_BLOCK";
  readonly provider: typeof AI_GATE_C_APPROVED_PROVIDER;
  readonly providerConfigurationVersion: typeof AI_GATE_C_PROVIDER_CONFIG_VERSION;
  readonly policyVersion: "ai-gate-b-policy-v1";
  readonly promptVersion: "ai-gate-b-gemini-discovery-v1";
  readonly evalVersion: "ai-gate-b-evals-v1";
  readonly latencyBucketMs: "0-250" | "251-1000" | "1001-3000" | "3001-5000" | "5001+";
  readonly inputChars: number;
  readonly outputItemCount: number;
  readonly providerRequestCount: number;
  readonly retryCount: number;
  readonly circuitState: AiGateCCircuitState;
  readonly usage: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly timestamp: string;
  readonly correlationId: string;
};

export type AiGateCProviderTelemetrySink = (event: AiGateCProviderTelemetry) => void | Promise<void>;

export type AiGateCCircuitPermit = {
  readonly ok: true;
  readonly state: "CLOSED" | "HALF_OPEN";
  readonly generation: string;
  recordSuccess(): Promise<void>;
  recordFailure(input: { readonly code: AiGateBProviderError["code"] }): Promise<void>;
  release(): Promise<void>;
};

export type AiGateCCircuitRejection = {
  readonly ok: false;
  readonly state: "OPEN";
  readonly retryAfterSeconds: number;
  readonly code: "RATE_LIMITED" | "UNAVAILABLE";
};

export type AiGateCCircuitBackend = {
  acquire(input: {
    readonly provider: typeof AI_GATE_C_APPROVED_PROVIDER;
    readonly modelId: (typeof AI_GATE_C_APPROVED_MODELS)[number];
    readonly configurationVersion: typeof AI_GATE_C_PROVIDER_CONFIG_VERSION;
  }): Promise<AiGateCCircuitPermit | AiGateCCircuitRejection>;
};

let circuitBackend: AiGateCCircuitBackend | null = null;

export function __setAiGateCProviderOperationsTestHooks(hooks?: {
  readonly circuitBackend?: AiGateCCircuitBackend;
}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AI Gate C provider operations test hooks are unavailable in production.");
  }
  circuitBackend = hooks?.circuitBackend ?? null;
}

export function createAiGateCRequestCorrelationId() {
  return `ai_gate_c_${randomUUID()}`;
}

export function getAiGateCDeploymentPosture(env: AiGateBEnv = process.env): AiGateCDeploymentPosture {
  const explicit = env.REZNO_AI_DEPLOYMENT_ENV ?? env.REZNO_DEPLOYMENT_ENV;
  if (explicit === "production" || explicit === "staging" || explicit === "local") return explicit;
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "staging";
  return env.NODE_ENV === "production" ? "production" : "local";
}

export function getAiGateCProviderReadiness(env: AiGateBEnv = process.env): AiGateCReadiness {
  const posture = getAiGateCDeploymentPosture(env);
  const base = {
    posture,
    provider: AI_GATE_C_APPROVED_PROVIDER,
    configurationVersion: AI_GATE_C_PROVIDER_CONFIG_VERSION,
    configured: false,
    secretConfigured: isConfiguredSecret(env.GEMINI_API_KEY),
    modelConfigured: isConfiguredSecret(env.GEMINI_MODEL),
    modelId: null,
  } satisfies Omit<AiGateCReadiness, "enabled" | "reason">;

  if (env.REZNO_AI_KILL_SWITCH === "true" || env.REZNO_AI_GATE_C_KILL_SWITCH === "true") {
    return { ...base, enabled: false, reason: "KILL_SWITCH_ACTIVE" };
  }
  if (env.REZNO_AI_ENABLED !== "true") return { ...base, enabled: false, reason: "FEATURE_DISABLED" };
  if (env.REZNO_AI_GEMINI_ENABLED !== "true") return { ...base, enabled: false, reason: "GEMINI_DISABLED" };
  if (env.REZNO_AI_GATE_C_ENABLED !== "true") return { ...base, enabled: false, reason: "GATE_C_DISABLED" };
  if (!isPostureApproved(posture, env)) return { ...base, enabled: false, reason: "ENVIRONMENT_NOT_APPROVED" };
  if (!base.secretConfigured) return { ...base, enabled: false, reason: "MISSING_GEMINI_KEY" };
  if (!base.modelConfigured) return { ...base, enabled: false, reason: "MISSING_GEMINI_MODEL" };
  if (!isApprovedAiGateCModel(env.GEMINI_MODEL)) return { ...base, enabled: false, reason: "INVALID_GEMINI_MODEL" };

  return {
    ...base,
    enabled: true,
    reason: "READY",
    configured: true,
    modelId: env.GEMINI_MODEL,
  };
}

export function getAiGateCClientReadiness(env: AiGateBEnv = process.env): AiGateCClientReadiness {
  const readiness = getAiGateCProviderReadiness(env);
  return {
    enabled: readiness.enabled,
    readiness: readiness.configured ? "configured" : "not-configured",
  };
}

export function isApprovedAiGateCModel(value: unknown): value is (typeof AI_GATE_C_APPROVED_MODELS)[number] {
  return typeof value === "string" && (AI_GATE_C_APPROVED_MODELS as readonly string[]).includes(value);
}

export function getAiGateCProviderRegistry() {
  return {
    gemini: {
      id: AI_GATE_C_APPROVED_PROVIDER,
      allowedModels: AI_GATE_C_APPROVED_MODELS,
      configurationVersion: AI_GATE_C_PROVIDER_CONFIG_VERSION,
    },
  } as const;
}

export function createAiGateCControlledGeminiProvider(input: {
  readonly personId: string;
  readonly env?: AiGateBEnv;
  readonly correlationId?: string;
  readonly telemetrySink?: AiGateCProviderTelemetrySink;
  readonly circuitBackend?: AiGateCCircuitBackend;
}): AiGateBProvider {
  if (!input.personId) throw new AiGateBProviderError("PERMISSION_DENIED", "AI_PROVIDER_PERSON_REQUIRED", { providerRequestCount: 0 });
  const env = input.env ?? process.env;
  return {
    id: "gemini",
    async complete(providerInput, signal) {
      const readiness = getAiGateCProviderReadiness(env);
      if (!readiness.enabled || !readiness.modelId || !env.GEMINI_API_KEY) {
        throw new AiGateBProviderError("UNAVAILABLE", readiness.reason, { providerRequestCount: 0 });
      }

      const circuit = await (input.circuitBackend ?? circuitBackend ?? defaultAiGateCCircuitBackend(env)).acquire({
        provider: readiness.provider,
        modelId: readiness.modelId,
        configurationVersion: readiness.configurationVersion,
      });
      if (!circuit.ok) {
        throw new AiGateBProviderError(
          circuit.code === "RATE_LIMITED" ? "QUOTA_OR_RATE_LIMITED" : "UNAVAILABLE",
          "AI_PROVIDER_CIRCUIT_OPEN",
          { providerRequestCount: 0 },
        );
      }

      const startedAt = Date.now();
      let outcome: AiGateCProviderTelemetry["outcome"] = "SUCCESS";
      let providerRequestCount = 0;
      let retryCount = 0;
      try {
        const provider = createGeminiGateBProvider({
          ...env,
          GEMINI_API_KEY: env.GEMINI_API_KEY,
          GEMINI_MODEL: readiness.modelId,
        }, {
          onProviderRequest() {
            providerRequestCount += 1;
          },
          onRetry() {
            retryCount += 1;
          },
        });
        const result = await provider.complete(providerInput, signal);
        await circuit.recordSuccess();
        return result;
      } catch (error) {
        const mapped = error instanceof AiGateBProviderError ? error : new AiGateBProviderError("UNAVAILABLE");
        providerRequestCount = mapped.providerRequestCount ?? providerRequestCount;
        outcome = toTelemetryOutcome(mapped.code);
        await circuit.recordFailure({ code: mapped.code });
        throw mapped;
      } finally {
        await circuit.release();
        await emitTelemetry(input.telemetrySink, {
          input: providerInput,
          outcome,
          providerRequestCount,
          retryCount,
          circuitState: circuit.state,
          startedAt,
          correlationId: input.correlationId ?? createAiGateCRequestCorrelationId(),
        });
      }
    },
  };
}

async function emitTelemetry(
  sink: AiGateCProviderTelemetrySink | undefined,
  input: {
    readonly input: AiGateBProviderInput;
    readonly outcome: AiGateCProviderTelemetry["outcome"];
    readonly providerRequestCount: number;
    readonly retryCount: number;
    readonly circuitState: AiGateCCircuitState;
    readonly startedAt: number;
    readonly correlationId: string;
  },
) {
  if (!sink) return;
  await sink({
    telemetryVersion: AI_GATE_C_TELEMETRY_VERSION,
    outcome: input.outcome,
    provider: AI_GATE_C_APPROVED_PROVIDER,
    providerConfigurationVersion: AI_GATE_C_PROVIDER_CONFIG_VERSION,
    policyVersion: "ai-gate-b-policy-v1",
    promptVersion: "ai-gate-b-gemini-discovery-v1",
    evalVersion: "ai-gate-b-evals-v1",
    latencyBucketMs: latencyBucket(Date.now() - input.startedAt),
    inputChars: input.input.normalizedQuestion.length,
    outputItemCount: input.input.results.length,
    providerRequestCount: input.providerRequestCount,
    retryCount: input.retryCount,
    circuitState: input.circuitState,
    usage: {},
    timestamp: new Date().toISOString(),
    correlationId: input.correlationId,
  });
}

function latencyBucket(latencyMs: number): AiGateCProviderTelemetry["latencyBucketMs"] {
  if (latencyMs <= 250) return "0-250";
  if (latencyMs <= 1_000) return "251-1000";
  if (latencyMs <= 3_000) return "1001-3000";
  if (latencyMs <= 5_000) return "3001-5000";
  return "5001+";
}

function toTelemetryOutcome(code: AiGateBProviderError["code"]): AiGateCProviderTelemetry["outcome"] {
  if (code === "INVALID_KEY") return "INVALID_KEY";
  if (code === "PERMISSION_DENIED") return "PERMISSION_DENIED";
  if (code === "QUOTA_OR_RATE_LIMITED") return "RATE_LIMITED";
  if (code === "TIMEOUT") return "TIMEOUT";
  if (code === "MALFORMED_OUTPUT") return "MALFORMED_OUTPUT";
  if (code === "SAFETY_BLOCK") return "SAFETY_BLOCK";
  return "UNAVAILABLE";
}

function isConfiguredSecret(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPostureApproved(posture: AiGateCDeploymentPosture, env: AiGateBEnv) {
  if (posture === "local") return env.REZNO_AI_GATE_C_LOCAL_PROVIDER_ENABLED === "true";
  if (posture === "staging") return env.REZNO_AI_GATE_C_STAGING_APPROVED === "true";
  return env.REZNO_AI_GATE_C_PRODUCTION_APPROVED === "true";
}

export function __createAiGateCMemoryCircuitBackendForTests(options: {
  readonly failureThreshold?: number;
  readonly openMs?: number;
  readonly now?: () => number;
} = {}): AiGateCCircuitBackend {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AI Gate C memory circuit backend is unavailable in production tests.");
  }
  return createMemoryCircuitBackend(options);
}

function createMemoryCircuitBackend(options: {
  readonly failureThreshold?: number;
  readonly openMs?: number;
  readonly now?: () => number;
} = {}): AiGateCCircuitBackend {
  const states = new Map<string, {
    state: AiGateCCircuitState;
    failures: number;
    generation: number;
    openedUntil: number;
    halfOpenProbe: boolean;
  }>();
  const failureThreshold = options.failureThreshold ?? 3;
  const openMs = options.openMs ?? 30_000;
  const nowMs = options.now ?? (() => Date.now());
  const keyFor = (input: {
    readonly provider: string;
    readonly modelId: string;
    readonly configurationVersion: string;
  }) => `${input.provider}:${input.modelId}:${input.configurationVersion}`;

  return {
    async acquire(input) {
      const now = nowMs();
      const key = keyFor(input);
      const current = states.get(key) ?? { state: "CLOSED" as const, failures: 0, generation: 1, openedUntil: 0, halfOpenProbe: false };
      if (current.state === "OPEN" && current.openedUntil > now) {
        states.set(key, current);
        return {
          ok: false,
          state: "OPEN",
          retryAfterSeconds: Math.max(1, Math.ceil((current.openedUntil - now) / 1_000)),
          code: "RATE_LIMITED",
        };
      }
      if (current.state === "OPEN") {
        current.state = "HALF_OPEN";
        current.halfOpenProbe = false;
      }
      if (current.state === "HALF_OPEN") {
        if (current.halfOpenProbe) {
          states.set(key, current);
          return { ok: false, state: "OPEN", retryAfterSeconds: 1, code: "RATE_LIMITED" };
        }
        current.halfOpenProbe = true;
      }
      states.set(key, current);
      const generation = String(current.generation);
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        const latest = states.get(key);
        if (latest && latest.generation === Number(generation) && latest.state === "HALF_OPEN") {
          latest.halfOpenProbe = false;
          states.set(key, latest);
        }
      };
      return {
        ok: true,
        state: current.state === "HALF_OPEN" ? "HALF_OPEN" : "CLOSED",
        generation,
        async recordSuccess() {
          const latest = states.get(key);
          if (!latest || latest.generation !== Number(generation)) return;
          states.set(key, { state: "CLOSED", failures: 0, generation: latest.generation + 1, openedUntil: 0, halfOpenProbe: false });
        },
        async recordFailure({ code }) {
          const latest = states.get(key);
          if (!latest || latest.generation !== Number(generation)) return;
          if (code === "QUOTA_OR_RATE_LIMITED" || code === "MALFORMED_OUTPUT" || code === "SAFETY_BLOCK") return;
          const failures = code === "INVALID_KEY" || code === "PERMISSION_DENIED"
            ? failureThreshold
            : latest.failures + 1;
          if (latest.state === "HALF_OPEN" || failures >= failureThreshold) {
            states.set(key, {
              state: "OPEN",
              failures,
              generation: latest.generation + 1,
              openedUntil: nowMs() + openMs,
              halfOpenProbe: false,
            });
            return;
          }
          states.set(key, { ...latest, failures });
        },
        release,
      };
    },
  };
}

const memoryCircuitBackend: AiGateCCircuitBackend = createMemoryCircuitBackend();

const postgresCircuitBackend: AiGateCCircuitBackend = {
  async acquire(input) {
    try {
      const key = circuitKey(input);
      const circuit = await readPostgresCircuit(key);
      if (circuit.state === "OPEN") {
        return {
          ok: false,
          state: "OPEN",
          retryAfterSeconds: circuit.retryAfterSeconds,
          code: "RATE_LIMITED",
        };
      }

      let client: PoolClient | null = null;
      const lockKey = `ai-gate-c:circuit:half-open:${key}`;
      if (circuit.state === "HALF_OPEN") {
        client = await postgresPool.connect();
        const locked = await tryPostgresAdvisoryLock(client, lockKey);
        if (!locked) {
          client.release();
          return { ok: false, state: "OPEN", retryAfterSeconds: 1, code: "RATE_LIMITED" };
        }
      }

      let released = false;
      const generation = circuit.generation;
      return {
        ok: true,
        state: circuit.state,
        generation,
        async recordSuccess() {
          if (!await postgresCircuitGenerationMatches(key, generation)) return;
          await prisma.distributedRateLimitBucket.deleteMany({
            where: { keyHash: circuitKeyHash(key) },
          });
        },
        async recordFailure({ code }) {
          if (code === "QUOTA_OR_RATE_LIMITED" || code === "MALFORMED_OUTPUT" || code === "SAFETY_BLOCK") return;
          if (!await postgresCircuitGenerationMatches(key, generation)) return;
          if (code === "INVALID_KEY" || code === "PERMISSION_DENIED" || circuit.state === "HALF_OPEN") {
            await forceOpenPostgresCircuit(key);
            return;
          }
          await consumeRateLimit("ai.gate-c.circuit.failure", key, {
            limit: AI_GATE_C_CIRCUIT_FAILURE_LIMIT,
            windowMs: AI_GATE_C_CIRCUIT_OPEN_MS,
          });
        },
        async release() {
          if (released) return;
          released = true;
          if (!client) return;
          try {
            await safePostgresAdvisoryUnlock(client, lockKey);
          } finally {
            client.release();
          }
        },
      };
    } catch {
      return { ok: false, state: "OPEN", retryAfterSeconds: 1, code: "UNAVAILABLE" };
    }
  },
};

function defaultAiGateCCircuitBackend(env: AiGateBEnv): AiGateCCircuitBackend {
  if (env.REZNO_RATE_LIMIT_BACKEND === "postgres" || env.NODE_ENV === "production") {
    return postgresCircuitBackend;
  }
  return memoryCircuitBackend;
}

function circuitKey(input: {
  readonly provider: typeof AI_GATE_C_APPROVED_PROVIDER;
  readonly modelId: (typeof AI_GATE_C_APPROVED_MODELS)[number];
  readonly configurationVersion: typeof AI_GATE_C_PROVIDER_CONFIG_VERSION;
}) {
  return `${input.provider}:${input.modelId}:${input.configurationVersion}`;
}

function circuitKeyHash(key: string) {
  return distributedRateLimitKeyHash("ai.gate-c.circuit.failure", key, {
    limit: AI_GATE_C_CIRCUIT_FAILURE_LIMIT,
    windowMs: AI_GATE_C_CIRCUIT_OPEN_MS,
  });
}

async function readPostgresCircuit(key: string): Promise<
  | { readonly state: "CLOSED"; readonly generation: string }
  | { readonly state: "HALF_OPEN"; readonly generation: string }
  | { readonly state: "OPEN"; readonly generation: string; readonly retryAfterSeconds: number }
> {
  const row = await prisma.distributedRateLimitBucket.findUnique({
    where: { keyHash: circuitKeyHash(key) },
    select: { count: true, resetAt: true, updatedAt: true },
  });
  return classifyPostgresCircuitRow(row, Date.now());
}

export function __classifyAiGateCPostgresCircuitRowForTests(
  row: { readonly count: number; readonly resetAt: Date; readonly updatedAt: Date } | null,
  nowMs: number,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AI Gate C circuit classification test hook is unavailable in production.");
  }
  return classifyPostgresCircuitRow(row, nowMs);
}

function classifyPostgresCircuitRow(
  row: { readonly count: number; readonly resetAt: Date; readonly updatedAt: Date } | null,
  nowMs: number,
): | { readonly state: "CLOSED"; readonly generation: string }
   | { readonly state: "HALF_OPEN"; readonly generation: string }
   | { readonly state: "OPEN"; readonly generation: string; readonly retryAfterSeconds: number } {
  if (!row) return { state: "CLOSED", generation: "empty" };
  const generation = postgresCircuitGeneration(row);
  if (row.count < AI_GATE_C_CIRCUIT_FAILURE_LIMIT) return { state: "CLOSED", generation };
  const retryAfterMs = row.resetAt.getTime() - nowMs;
  if (retryAfterMs > 0) {
    return {
      state: "OPEN",
      generation,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    };
  }
  return { state: "HALF_OPEN", generation };
}

async function postgresCircuitGenerationMatches(key: string, expected: string) {
  const current = await readPostgresCircuit(key);
  return current.generation === expected;
}

function postgresCircuitGeneration(row: { readonly count: number; readonly resetAt: Date; readonly updatedAt: Date }) {
  return `${row.count}:${row.resetAt.toISOString()}:${row.updatedAt.toISOString()}`;
}

async function forceOpenPostgresCircuit(key: string) {
  const keyHash = circuitKeyHash(key);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DistributedRateLimitBucket" (
      "keyHash",
      "keyVersion",
      "count",
      "windowStartedAt",
      "resetAt",
      "expiresAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${keyHash},
      1,
      ${AI_GATE_C_CIRCUIT_FAILURE_LIMIT + 1},
      clock_timestamp(),
      clock_timestamp() + (${AI_GATE_C_CIRCUIT_OPEN_MS} * INTERVAL '1 millisecond'),
      clock_timestamp() + (${AI_GATE_C_CIRCUIT_OPEN_MS * 2} * INTERVAL '1 millisecond'),
      clock_timestamp(),
      clock_timestamp()
    )
    ON CONFLICT ("keyHash") DO UPDATE
    SET
      "count" = EXCLUDED."count",
      "windowStartedAt" = EXCLUDED."windowStartedAt",
      "resetAt" = EXCLUDED."resetAt",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `);
}

async function tryPostgresAdvisoryLock(client: PoolClient, key: string) {
  const result = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS \"locked\"",
    [key],
  );
  return result.rows[0]?.locked === true;
}

async function safePostgresAdvisoryUnlock(client: PoolClient, key: string) {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]);
  } catch {
    // The pooled session is about to be released; never surface lock details.
  }
}
