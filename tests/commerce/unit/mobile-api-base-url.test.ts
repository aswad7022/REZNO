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
