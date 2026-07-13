import assert from "node:assert/strict";
import test from "node:test";

import { mergeMobileSessionCookies } from "../../../apps/mobile/src/auth/session-cookie-state";

test("mobile auth cookie transport stores, replaces, and expires Better Auth cookies", () => {
  const now = Date.parse("2026-07-13T12:00:00.000Z");
  const initial = {
    "better-auth.session_token": {
      expires: "2026-07-14T12:00:00.000Z",
      value: "old-token",
    },
    unrelated: { expires: null, value: "preserved" },
  };

  const replaced = mergeMobileSessionCookies(
    initial,
    "better-auth.session_token=new-token; Path=/; Max-Age=3600; HttpOnly",
    now,
  );
  assert.deepEqual(replaced, {
    "better-auth.session_token": {
      expires: "2026-07-13T13:00:00.000Z",
      value: "new-token",
    },
    unrelated: { expires: null, value: "preserved" },
  });
  assert.equal(initial["better-auth.session_token"].value, "old-token");

  const signedOut = mergeMobileSessionCookies(
    replaced,
    "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly",
    now,
  );
  assert.deepEqual(signedOut, {
    unrelated: { expires: null, value: "preserved" },
  });
});
