import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  consume(scope: string, identifier: string, options: RateLimitOptions): RateLimitResult;
}

export type TrustedProxyHeader = "x-forwarded-for" | "x-real-ip";

export interface RateLimitIdentityOptions {
  directPeerAddress?: string | null;
  trustedProxyHeader?: TrustedProxyHeader;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxBuckets = 10_000,
  ) {
    if (!Number.isSafeInteger(maxBuckets) || maxBuckets < 1) {
      throw new RangeError("maxBuckets must be a positive safe integer.");
    }
  }

  consume(scope: string, identifier: string, options: RateLimitOptions): RateLimitResult {
    const now = this.now();
    const key = `${scope}:${identifier}`;
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket) this.makeRoom(now);
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
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

  get size() {
    return this.buckets.size;
  }

  private makeRoom(now: number) {
    if (this.buckets.size < this.maxBuckets) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __reznoRateLimitStore?: RateLimitStore;
};
const store = globalForRateLimit.__reznoRateLimitStore ?? new MemoryRateLimitStore();
globalForRateLimit.__reznoRateLimitStore = store;

export function consumeRateLimit(scope: string, identifier: string, options: RateLimitOptions) {
  return store.consume(scope, identifier, options);
}

export function getRateLimitIdentifierFromHeaders(
  headerStore: Headers,
  fallback = "unknown-client",
  options: RateLimitIdentityOptions = {},
) {
  if (options.trustedProxyHeader) {
    const trustedAddress = normalizeRateLimitIpAddress(headerStore.get(options.trustedProxyHeader));
    if (trustedAddress) return `trusted-ip:${hashIdentifier(trustedAddress)}`;
    return fallbackIdentifier(headerStore, fallback);
  }

  const directAddress = normalizeRateLimitIpAddress(options.directPeerAddress);
  if (directAddress) return `peer-ip:${hashIdentifier(directAddress)}`;
  return fallbackIdentifier(headerStore, fallback);
}

export function normalizeRateLimitIpAddress(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate.includes(",")) return null;
  const version = isIP(candidate);
  if (version === 4) return candidate.split(".").map(Number).join(".");
  if (version === 6) {
    try {
      return new URL(`http://[${candidate}]/`).hostname.slice(1, -1).toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

export function configuredTrustedProxyHeader(
  value = process.env.REZNO_TRUSTED_PROXY_HEADER,
): TrustedProxyHeader | undefined {
  if (value === "x-forwarded-for" || value === "x-real-ip") return value;
  return undefined;
}

function fallbackIdentifier(headerStore: Headers, fallback: string) {
  const fingerprint = [
    headerStore.get("user-agent"),
    headerStore.get("accept-language"),
    headerStore.get("accept-encoding"),
  ]
    .filter(Boolean)
    .join("|");
  if (fingerprint) return `fingerprint:${hashIdentifier(fingerprint)}`;
  return `ephemeral:${hashIdentifier(`${fallback}:${randomUUID()}`)}`;
}

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
