import "server-only";

import { createHmac, hkdfSync } from "node:crypto";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import {
  configuredTrustedProxyHeader,
  getRateLimitIdentifierFromHeaders,
  MemoryRateLimitStore,
  type RateLimitOptions,
} from "@/lib/security/rate-limit-core";

export interface DistributedRateLimitResult {
  success: boolean;
  retryAfterSeconds: number;
  unavailable?: boolean;
}

const LOCAL_MEMORY_BACKEND = new MemoryRateLimitStore();
const RATE_LIMIT_KEY_VERSION = 1;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;
const RATE_LIMIT_SCOPE = /^[A-Za-z0-9:._-]{1,128}$/;

interface BucketResult {
  count: number;
  databaseNow: Date;
  resetAt: Date;
}

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  options: RateLimitOptions,
): Promise<DistributedRateLimitResult> {
  assertRateLimitInput(scope, identifier, options);
  if (shouldUseLocalMemoryBackend()) {
    const result = LOCAL_MEMORY_BACKEND.consume(scope, identifier, options);
    return { ...result, unavailable: false };
  }

  try {
    const keyHash = distributedRateLimitKeyHash(scope, identifier, options);
    const retentionMs = Math.max(60_000, options.windowMs);
    const rows = await prisma.$queryRaw<BucketResult[]>(Prisma.sql`
      WITH authoritative_clock AS (
        SELECT clock_timestamp() AS now
      )
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
      SELECT
        ${keyHash},
        ${RATE_LIMIT_KEY_VERSION},
        1,
        clock.now,
        clock.now + (${options.windowMs} * INTERVAL '1 millisecond'),
        clock.now + (${options.windowMs + retentionMs} * INTERVAL '1 millisecond'),
        clock.now,
        clock.now
      FROM authoritative_clock clock
      ON CONFLICT ("keyHash") DO UPDATE
      SET
        "keyVersion" = EXCLUDED."keyVersion",
        "count" = CASE
          WHEN "DistributedRateLimitBucket"."resetAt" <= EXCLUDED."windowStartedAt" THEN 1
          ELSE LEAST(
            "DistributedRateLimitBucket"."count" + 1,
            ${options.limit + 1}
          )
        END,
        "windowStartedAt" = CASE
          WHEN "DistributedRateLimitBucket"."resetAt" <= EXCLUDED."windowStartedAt"
            THEN EXCLUDED."windowStartedAt"
          ELSE "DistributedRateLimitBucket"."windowStartedAt"
        END,
        "resetAt" = CASE
          WHEN "DistributedRateLimitBucket"."resetAt" <= EXCLUDED."windowStartedAt"
            THEN EXCLUDED."resetAt"
          ELSE "DistributedRateLimitBucket"."resetAt"
        END,
        "expiresAt" = CASE
          WHEN "DistributedRateLimitBucket"."resetAt" <= EXCLUDED."windowStartedAt"
            THEN EXCLUDED."expiresAt"
          ELSE GREATEST(
            "DistributedRateLimitBucket"."expiresAt",
            EXCLUDED."windowStartedAt" + (${retentionMs} * INTERVAL '1 millisecond')
          )
        END,
        "updatedAt" = EXCLUDED."updatedAt"
      RETURNING
        "count",
        "resetAt",
        clock_timestamp() AS "databaseNow"
    `);
    const bucket = rows[0];
    if (!bucket) throw new Error("RATE_LIMIT_BUCKET_RESULT_MISSING");
    if (bucket.count <= options.limit) {
      return { success: true, retryAfterSeconds: 0, unavailable: false };
    }
    return {
      success: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (bucket.resetAt.getTime() - bucket.databaseNow.getTime()) / 1_000,
        ),
      ),
      unavailable: false,
    };
  } catch (error) {
    logServerError("rateLimit.consume", error, { scope });
    return { success: false, retryAfterSeconds: 1, unavailable: true };
  }
}

export function getRequestRateLimitIdentifierFromHeaders(
  headerStore: Headers,
  fallback = "unknown-client",
) {
  return getRateLimitIdentifierFromHeaders(headerStore, fallback, {
    trustedProxyHeader: configuredTrustedProxyHeader(),
  });
}

export async function getRequestRateLimitIdentifier(fallback: string) {
  try {
    return getRequestRateLimitIdentifierFromHeaders(await headers(), fallback);
  } catch (error) {
    logServerError("rateLimit.identifier", error);
    return getRateLimitIdentifierFromHeaders(new Headers(), fallback);
  }
}

function shouldUseLocalMemoryBackend() {
  if (process.env.REZNO_RATE_LIMIT_BACKEND === "postgres") return false;
  if (process.env.REZNO_RATE_LIMIT_BACKEND === "memory") {
    return process.env.NODE_ENV !== "production";
  }
  return process.env.NODE_ENV !== "production";
}

export function distributedRateLimitKeyHash(
  scope: string,
  identifier: string,
  options: RateLimitOptions,
) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (
    !secret
    || secret !== secret.trim()
    || secret.length < 32
    || secret.length * Math.log2(new Set(secret).size) < 120
  ) {
    throw new Error("RATE_LIMIT_KEY_UNAVAILABLE");
  }
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from("rezno:distributed-rate-limit", "utf8"),
      Buffer.from(`bucket-key:v${RATE_LIMIT_KEY_VERSION}`, "utf8"),
      32,
    ),
  );
  return createHmac("sha256", key)
    .update(
      `${RATE_LIMIT_KEY_VERSION}\0${scope}\0${options.limit}\0${options.windowMs}\0${identifier}`,
    )
    .digest("hex");
}

function assertRateLimitInput(
  scope: string,
  identifier: string,
  options: RateLimitOptions,
) {
  if (!RATE_LIMIT_SCOPE.test(scope)) {
    throw new RangeError("Rate-limit scope is invalid.");
  }
  if (!identifier || Buffer.byteLength(identifier, "utf8") > 1_024) {
    throw new RangeError("Rate-limit identifier is invalid.");
  }
  if (
    !Number.isSafeInteger(options.limit)
    || options.limit < 1
    || options.limit >= 2_147_483_647
    || !Number.isSafeInteger(options.windowMs)
    || options.windowMs < 1_000
    || options.windowMs > MAX_WINDOW_MS
  ) {
    throw new RangeError("Rate-limit options are invalid.");
  }
}
