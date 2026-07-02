import "server-only";

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

const globalForRateLimit = globalThis as typeof globalThis & {
  __reznoRateLimitStore?: Map<string, RateLimitBucket>;
};

const store = globalForRateLimit.__reznoRateLimitStore ?? new Map<string, RateLimitBucket>();
globalForRateLimit.__reznoRateLimitStore = store;

function cleanupExpiredBuckets(now: number) {
  if (store.size < 500) return;
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export function consumeRateLimit(
  scope: string,
  identifier: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  cleanupExpiredBuckets(now);
  const key = `${scope}:${identifier}`;
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { success: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= options.limit) {
    return {
      success: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { success: true, retryAfterSeconds: 0 };
}

export async function getRequestRateLimitIdentifier(fallback: string) {
  try {
    const headerStore = await headers();
    const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = headerStore.get("x-real-ip")?.trim();
    return forwardedFor || realIp || fallback;
  } catch (error) {
    logServerError("rateLimit.identifier", error);
    return fallback;
  }
}
