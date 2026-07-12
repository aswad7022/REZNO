import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  configuredTrustedProxyHeader,
  getRateLimitIdentifierFromHeaders,
  MemoryRateLimitStore,
  normalizeRateLimitIpAddress,
} from "../../../lib/security/rate-limit-core";

test("direct peer identity wins when proxy trust is disabled", () => {
  const forgedLeft = new Headers({
    "user-agent": "same-client",
    "x-forwarded-for": "198.51.100.1, 203.0.113.1",
    "x-real-ip": "not-an-ip",
  });
  const forgedRight = new Headers({
    "user-agent": "same-client",
    "x-forwarded-for": "192.0.2.50",
    "x-real-ip": "192.0.2.51",
  });
  const left = getRateLimitIdentifierFromHeaders(forgedLeft, "fallback", {
    directPeerAddress: " 2001:0DB8:0:0:0:0:0:1 ",
  });
  const right = getRateLimitIdentifierFromHeaders(forgedRight, "fallback", {
    directPeerAddress: "2001:db8::1",
  });
  assert.equal(left, right);
  assert.match(left, /^peer-ip:/);
  assert.notEqual(
    left,
    getRateLimitIdentifierFromHeaders(forgedRight, "fallback", {
      directPeerAddress: "2001:db8::2",
    }),
  );
});

test("missing peer uses a bounded fingerprint and never one global empty fallback bucket", () => {
  const first = getRateLimitIdentifierFromHeaders(new Headers({ "user-agent": "client-a" }), "fallback");
  const second = getRateLimitIdentifierFromHeaders(new Headers({ "user-agent": "client-b" }), "fallback");
  assert.match(first, /^fingerprint:/);
  assert.notEqual(first, second);

  const unidentifiedA = getRateLimitIdentifierFromHeaders(new Headers(), "fallback");
  const unidentifiedB = getRateLimitIdentifierFromHeaders(new Headers(), "fallback");
  assert.match(unidentifiedA, /^ephemeral:/);
  assert.notEqual(unidentifiedA, unidentifiedB);
});

test("one explicitly configured trusted header accepts only one normalized valid IP", () => {
  const headers = new Headers({
    "user-agent": "trusted-client",
    "x-forwarded-for": " 2001:0DB8:0:0:0:0:0:1 ",
    "x-real-ip": "203.0.113.9",
  });
  const forwarded = getRateLimitIdentifierFromHeaders(headers, "fallback", {
    trustedProxyHeader: "x-forwarded-for",
  });
  const equivalent = getRateLimitIdentifierFromHeaders(
    new Headers({ "user-agent": "different-fingerprint", "x-forwarded-for": "2001:db8::1" }),
    "fallback",
    { trustedProxyHeader: "x-forwarded-for" },
  );
  const realIp = getRateLimitIdentifierFromHeaders(headers, "fallback", {
    trustedProxyHeader: "x-real-ip",
  });
  assert.match(forwarded, /^trusted-ip:/);
  assert.equal(forwarded, equivalent);
  assert.notEqual(forwarded, realIp);
  assert.equal(configuredTrustedProxyHeader("x-forwarded-for"), "x-forwarded-for");
  assert.equal(configuredTrustedProxyHeader("x-real-ip"), "x-real-ip");
  assert.equal(configuredTrustedProxyHeader("true"), undefined);
  assert.equal(configuredTrustedProxyHeader("X-Forwarded-For"), undefined);
});

test("malformed, chained, empty, and conflicting forwarding values cannot become trusted IPs", () => {
  for (const value of [
    "198.51.100.1, 203.0.113.1",
    "999.1.1.1",
    "2001:::1",
    "",
    "   ",
    "198.51.100.1:443",
  ]) {
    const identifier = getRateLimitIdentifierFromHeaders(
      new Headers({ "user-agent": "fallback-client", "x-forwarded-for": value }),
      "fallback",
      { trustedProxyHeader: "x-forwarded-for" },
    );
    assert.match(identifier, /^fingerprint:/, value);
  }

  const conflict = new Headers({
    "user-agent": "fallback-client",
    "x-forwarded-for": "invalid",
    "x-real-ip": "203.0.113.20",
  });
  assert.match(
    getRateLimitIdentifierFromHeaders(conflict, "fallback", {
      trustedProxyHeader: "x-forwarded-for",
    }),
    /^fingerprint:/,
  );
  assert.match(
    getRateLimitIdentifierFromHeaders(conflict, "fallback", {
      trustedProxyHeader: "x-real-ip",
    }),
    /^trusted-ip:/,
  );

  assert.equal(normalizeRateLimitIpAddress(" 192.0.2.1 "), "192.0.2.1");
  assert.equal(normalizeRateLimitIpAddress("2001:0DB8:0:0:0:0:0:1"), "2001:db8::1");
  assert.equal(normalizeRateLimitIpAddress("192.0.2.1, 198.51.100.1"), null);
});

test("buckets isolate clients, reset after the window, clean expired state, and stay bounded", () => {
  let now = 1_000;
  const store = new MemoryRateLimitStore(() => now, 3);
  const options = { limit: 2, windowMs: 1_000 };

  assert.equal(store.consume("scope", "client-a", options).success, true);
  assert.equal(store.consume("scope", "client-a", options).success, true);
  assert.equal(store.consume("scope", "client-a", options).success, false);
  assert.equal(store.consume("scope", "client-b", options).success, true);

  now = 2_001;
  assert.equal(store.consume("scope", "client-a", options).success, true);
  assert.equal(store.consume("scope", "client-c", options).success, true);
  assert.equal(store.size, 3);

  assert.equal(store.consume("scope", "client-d", options).success, true);
  assert.equal(store.size, 3, "the expired client-b bucket should be replaced, not accumulated");

  let cleanupNow = 5_000;
  const cleanup = new MemoryRateLimitStore(() => cleanupNow, 2);
  cleanup.consume("scope", "one", options);
  cleanup.consume("scope", "two", options);
  cleanupNow = 6_001;
  cleanup.consume("scope", "three", options);
  assert.equal(cleanup.size, 1, "expired buckets should be removed before a new bucket is added");

  const bounded = new MemoryRateLimitStore(() => 5_000, 2);
  bounded.consume("scope", "one", options);
  bounded.consume("scope", "two", options);
  bounded.consume("scope", "three", options);
  assert.equal(bounded.size, 2);
});

test("every pre-existing consumer retains its exact scope, limit, window, and response contract", () => {
  const contracts: Array<[string, RegExp[]]> = [
    [
      "app/api/auth/[...all]/route.ts",
      [/consumeRateLimit\("auth:post"/, /limit:\s*30/, /windowMs:\s*60_000/, /status:\s*429/, /Retry-After/],
    ],
    [
      "app/api/mobile/marketplace/route.ts",
      [/consumeRateLimit\("mobile\.marketplace"/, /limit:\s*120/, /windowMs:\s*60_000/, /"RATE_LIMITED"/, /429/],
    ],
    [
      "features/bookings/actions/manage-bookings.ts",
      [/consumeRateLimit\("booking:create"/, /limit:\s*6/, /windowMs:\s*60_000/, /rateLimited/],
    ],
    [
      "features/messages/actions/messages.ts",
      [
        /consumeRateLimit\("message:start"/,
        /consumeRateLimit\("message:send"/,
        /consumeRateLimit\("message:adminStart"/,
        /limit:\s*10/,
        /limit:\s*20/,
        /windowMs:\s*60_000/,
      ],
    ],
    [
      "features/notifications/actions/admin-notifications.ts",
      [/"adminNotification:create"/, /limit:\s*10/, /windowMs:\s*60_000/],
    ],
    [
      "features/restaurants/actions/create-reservation.ts",
      [/"restaurantReservation:create"/, /limit:\s*6/, /windowMs:\s*60_000/, /rateLimited/],
    ],
  ];

  for (const [file, patterns] of contracts) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const pattern of patterns) assert.match(source, pattern, `${file}: ${pattern}`);
  }
});
