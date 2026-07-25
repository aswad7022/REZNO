import assert from "node:assert/strict";
import test from "node:test";

import { resolveMobileApiBaseUrl } from "../../../apps/mobile/src/config/api-base-url";

test("mobile API origin uses localhost only for an unconfigured development bundle", () => {
  assert.equal(resolveMobileApiBaseUrl(undefined, true), "http://localhost:3000");
  assert.throws(
    () => resolveMobileApiBaseUrl(undefined, false),
    /required for a release build/,
  );
});

test("mobile API origin requires HTTPS outside development", () => {
  assert.equal(
    resolveMobileApiBaseUrl("http://192.168.1.10:3000/", true),
    "http://192.168.1.10:3000",
  );
  assert.equal(
    resolveMobileApiBaseUrl("https://rezno-staging.vercel.app/", false),
    "https://rezno-staging.vercel.app",
  );
  assert.throws(
    () => resolveMobileApiBaseUrl("http://localhost:3000", false),
    /must use HTTPS for a release build/,
  );
});

test("mobile API origin rejects loopback and private-looking release hosts", () => {
  for (const value of [
    "https://localhost",
    "https://api.localhost",
    "https://127.0.0.1",
    "https://192.168.1.10",
    "https://[::1]",
    "https://rezno.internal",
    "https://rezno.local",
    "https://single-label",
  ]) {
    assert.throws(
      () => resolveMobileApiBaseUrl(value, false),
      /public hostname/,
    );
  }
});

test("mobile API origin is an external origin without credentials or URL suffixes", () => {
  for (const value of [
    "https://user:password@example.com",
    "https://example.com/api",
    "https://example.com?environment=staging",
    "https://example.com/#fragment",
  ]) {
    assert.throws(
      () => resolveMobileApiBaseUrl(value, false),
      /credentials|origin without a path/,
    );
  }
  assert.throws(
    () => resolveMobileApiBaseUrl("https://example.com:8443", false),
    /standard HTTPS port/,
  );
  assert.equal(
    resolveMobileApiBaseUrl(
      "https://rezno-staging.vercel.app/",
      false,
    ),
    "https://rezno-staging.vercel.app",
  );
});

test("mobile API origin rejects malformed and non-HTTP values", () => {
  assert.throws(
    () => resolveMobileApiBaseUrl("not a URL", true),
    /must be a valid URL/,
  );
  assert.throws(
    () => resolveMobileApiBaseUrl("file:///tmp/rezno", true),
    /must use HTTP or HTTPS/,
  );
});
