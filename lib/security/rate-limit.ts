import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { logServerError } from "@/lib/logging/server";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  retryAfterSeconds: number;
}

interface RateLimitStore {
  consume(
    scope: string,
    identifier: string,
    options: RateLimitOptions,
  ): RateLimitResult;
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  private cleanupExpiredBuckets(now: number) {
    if (this.buckets.size < 500) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  consume(
    scope: string,
    identifier: string,
    options: RateLimitOptions,
  ): RateLimitResult {
    const now = Date.now();
    this.cleanupExpiredBuckets(now);
    const key = `${scope}:${identifier}`;
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return { success: true, retryAfterSeconds: 0 };
    }

    if (bucket.count >= options.limit) {
      return {
        success: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000),
        ),
      };
    }

    bucket.count += 1;
    return { success: true, retryAfterSeconds: 0 };
  }
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __reznoRateLimitStore?: RateLimitStore;
};

const store =
  globalForRateLimit.__reznoRateLimitStore ?? new MemoryRateLimitStore();
globalForRateLimit.__reznoRateLimitStore = store;

export function consumeRateLimit(
  scope: string,
  identifier: string,
  options: RateLimitOptions,
): RateLimitResult {
  return store.consume(scope, identifier, options);
}

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getHeaderValue(headerStore: Headers, name: string) {
  return headerStore.get(name)?.split(",")[0]?.trim() ?? "";
}

export function getRequestRateLimitIdentifierFromHeaders(
  headerStore: Headers,
  fallback = "unknown-client",
) {
  // Production deployments must ensure the edge/proxy overwrites these headers.
  // If not, clients can spoof them; the fingerprint fallback preserves local/dev behavior.
  const forwardedFor = getHeaderValue(headerStore, "x-forwarded-for");
  const realIp = getHeaderValue(headerStore, "x-real-ip");
  const fingerprint = [
    headerStore.get("user-agent"),
    headerStore.get("accept-language"),
    headerStore.get("accept-encoding"),
  ]
    .filter(Boolean)
    .join("|");

  if (forwardedFor) return `ip:${hashIdentifier(forwardedFor)}`;
  if (realIp) return `ip:${hashIdentifier(realIp)}`;
  if (fingerprint) return `fingerprint:${hashIdentifier(fingerprint)}`;
  return fallback;
}

export async function getRequestRateLimitIdentifier(fallback: string) {
  try {
    return getRequestRateLimitIdentifierFromHeaders(await headers(), fallback);
  } catch (error) {
    logServerError("rateLimit.identifier", error);
    return fallback;
  }
}
