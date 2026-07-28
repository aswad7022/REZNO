import "server-only";

import type { PoolClient } from "pg";

import { postgresPool } from "@/lib/db/prisma";
import { consumeRateLimit, type DistributedRateLimitResult } from "@/lib/security/rate-limit";

export type AiGateBBudgetLease = {
  readonly ok: true;
  release(): Promise<void>;
};

export type AiGateBBudgetRejection = {
  readonly ok: false;
  readonly code: "RATE_LIMITED" | "UNAVAILABLE";
  readonly retryAfterSeconds: number;
};

type AiGateBRateLimitConsumer = typeof consumeRateLimit;
type AiGateBConcurrencyBackend = {
  acquire(identifier: string): Promise<AiGateBBudgetLease | AiGateBBudgetRejection>;
};

const PERSON_RATE = Object.freeze({ limit: 6, windowMs: 60_000 });
const SERVICE_RATE = Object.freeze({ limit: 30, windowMs: 60_000 });
const GATE_C_PERSON_DAILY_RATE = Object.freeze({ limit: 60, windowMs: 24 * 60 * 60_000 });
const GATE_C_SERVICE_DAILY_RATE = Object.freeze({ limit: 200, windowMs: 24 * 60 * 60_000 });
const SERVICE_CONCURRENCY = 2;

let rateLimitConsumer: AiGateBRateLimitConsumer = consumeRateLimit;
let concurrencyBackend: AiGateBConcurrencyBackend | null = null;

export async function acquireAiGateBProviderBudget(personId: string): Promise<AiGateBBudgetLease | AiGateBBudgetRejection> {
  const personRate = await consumeBudgetRate("ai.gate-b.person", `person:${personId}`, PERSON_RATE);
  if (!personRate.ok) return personRate;
  const serviceRate = await consumeBudgetRate("ai.gate-b.service", "service:gemini-free-tier", SERVICE_RATE);
  if (!serviceRate.ok) return serviceRate;
  const lease = await (concurrencyBackend ?? defaultConcurrencyBackend()).acquire(personId);
  return lease.ok ? idempotentLease(lease) : lease;
}

export async function acquireAiGateCProviderBudget(personId: string): Promise<AiGateBBudgetLease | AiGateBBudgetRejection> {
  const personWindow = await consumeBudgetRate("ai.gate-c.person.window", `person:${personId}`, PERSON_RATE);
  if (!personWindow.ok) return personWindow;
  const personDaily = await consumeBudgetRate("ai.gate-c.person.daily", `person:${personId}`, GATE_C_PERSON_DAILY_RATE);
  if (!personDaily.ok) return personDaily;
  const serviceWindow = await consumeBudgetRate("ai.gate-c.service.window", "service:gemini-free-tier", SERVICE_RATE);
  if (!serviceWindow.ok) return serviceWindow;
  const serviceDaily = await consumeBudgetRate("ai.gate-c.service.daily", "service:gemini-free-tier", GATE_C_SERVICE_DAILY_RATE);
  if (!serviceDaily.ok) return serviceDaily;
  const lease = await (concurrencyBackend ?? defaultGateCConcurrencyBackend()).acquire(personId);
  return lease.ok ? idempotentLease(lease) : lease;
}

export function __setAiGateBBudgetTestHooks(hooks?: {
  readonly consumeRateLimit?: AiGateBRateLimitConsumer;
  readonly concurrencyBackend?: AiGateBConcurrencyBackend;
}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AI Gate B budget test hooks are unavailable in production.");
  }
  rateLimitConsumer = hooks?.consumeRateLimit ?? consumeRateLimit;
  concurrencyBackend = hooks?.concurrencyBackend ?? null;
}

async function consumeBudgetRate(
  scope: string,
  identifier: string,
  options: { readonly limit: number; readonly windowMs: number },
): Promise<{ readonly ok: true } | AiGateBBudgetRejection> {
  const result: DistributedRateLimitResult = await rateLimitConsumer(scope, identifier, options);
  if (result.unavailable) return { ok: false, code: "UNAVAILABLE", retryAfterSeconds: 1 };
  if (!result.success) return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds };
  return { ok: true };
}

function idempotentLease(lease: AiGateBBudgetLease): AiGateBBudgetLease {
  let released = false;
  return {
    ok: true,
    async release() {
      if (released) return;
      released = true;
      await lease.release();
    },
  };
}

function defaultConcurrencyBackend(): AiGateBConcurrencyBackend {
  if (process.env.REZNO_RATE_LIMIT_BACKEND === "postgres" || process.env.NODE_ENV === "production") {
    return POSTGRES_CONCURRENCY_BACKEND;
  }
  return MEMORY_CONCURRENCY_BACKEND;
}

function createMemoryConcurrencyBackend(): AiGateBConcurrencyBackend {
  const activePeople = new Set<string>();
  let activeService = 0;
  return {
    async acquire(identifier) {
      if (activePeople.has(identifier) || activeService >= SERVICE_CONCURRENCY) {
        return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 1 };
      }
      activePeople.add(identifier);
      activeService += 1;
      let released = false;
      return {
        ok: true,
        async release() {
          if (released) return;
          released = true;
          activePeople.delete(identifier);
          activeService = Math.max(0, activeService - 1);
        },
      };
    },
  };
}

const MEMORY_CONCURRENCY_BACKEND: AiGateBConcurrencyBackend = createMemoryConcurrencyBackend();
const GATE_C_MEMORY_CONCURRENCY_BACKEND: AiGateBConcurrencyBackend = createMemoryConcurrencyBackend();

function createPostgresConcurrencyBackend(prefix: "ai-gate-b" | "ai-gate-c"): AiGateBConcurrencyBackend {
  return {
    async acquire(identifier) {
    let client: PoolClient | null = null;
    let serviceLockKey: string | null = null;
    let personLocked = false;
    try {
      client = await postgresPool.connect();
      serviceLockKey = await tryAnyServiceLock(client, prefix);
      if (!serviceLockKey) {
        client.release();
        return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 1 };
      }
      personLocked = await tryAdvisoryLock(client, `${prefix}:person:${identifier}`);
      if (!personLocked) {
        await safeUnlock(client, serviceLockKey);
        client.release();
        return { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 1 };
      }
      let released = false;
      return {
        ok: true,
        async release() {
          if (released) return;
          released = true;
          if (!client) return;
          try {
            await safeUnlock(client, `${prefix}:person:${identifier}`);
            if (serviceLockKey) await safeUnlock(client, serviceLockKey);
          } finally {
            client.release();
          }
        },
      };
    } catch {
      if (client) {
        if (personLocked) await safeUnlock(client, `${prefix}:person:${identifier}`);
        if (serviceLockKey) await safeUnlock(client, serviceLockKey);
        client.release();
      }
      return { ok: false, code: "UNAVAILABLE", retryAfterSeconds: 1 };
    }
  },
  };
}

const POSTGRES_CONCURRENCY_BACKEND: AiGateBConcurrencyBackend = createPostgresConcurrencyBackend("ai-gate-b");
const GATE_C_POSTGRES_CONCURRENCY_BACKEND: AiGateBConcurrencyBackend = createPostgresConcurrencyBackend("ai-gate-c");

function defaultGateCConcurrencyBackend(): AiGateBConcurrencyBackend {
  if (process.env.REZNO_RATE_LIMIT_BACKEND === "postgres" || process.env.NODE_ENV === "production") {
    return GATE_C_POSTGRES_CONCURRENCY_BACKEND;
  }
  return GATE_C_MEMORY_CONCURRENCY_BACKEND;
}

async function tryAnyServiceLock(client: PoolClient, prefix = "ai-gate-b") {
  for (let slot = 0; slot < SERVICE_CONCURRENCY; slot += 1) {
    const key = `${prefix}:service:gemini-free-tier:${slot}`;
    if (await tryAdvisoryLock(client, key)) return key;
  }
  return null;
}

async function tryAdvisoryLock(client: PoolClient, key: string) {
  const result = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS \"locked\"",
    [key],
  );
  return result.rows[0]?.locked === true;
}

async function safeUnlock(client: PoolClient, key: string) {
  try {
    await client.query(
      "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
      [key],
    );
  } catch {
    // The session is about to be released or discarded; never surface lock-key details.
  }
}
