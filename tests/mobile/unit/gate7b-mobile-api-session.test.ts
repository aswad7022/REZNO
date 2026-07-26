import assert from "node:assert/strict";
import test from "node:test";

import {
  executeMobileApiRequest,
  type MobileApiRequestOptions,
} from "../../../apps/mobile/src/api/transport";

const API_BASE_URL = "https://rezno-staging.vercel.app";
const COOKIE_A = "better-auth.session_token=owner-a";
const COOKIE_B = "better-auth.session_token=owner-b";

test("Gate 7B captured runner uses only its claim-time cookie after the native jar changes", async () => {
  const requests: Array<{
    credentials: RequestCredentials | undefined;
    cookie: string | null;
  }> = [];
  const originalFetch = globalThis.fetch;
  let nativeJarCookie = COOKIE_A;

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    if (init?.credentials === "include") {
      headers.set("cookie", nativeJarCookie);
    }
    requests.push({
      credentials: init?.credentials,
      cookie: headers.get("cookie"),
    });
    return jsonResponse({ data: { id: "asset-a" } });
  };

  try {
    const capturedContext = {
      apiBaseUrl: API_BASE_URL,
      cookie: COOKIE_A,
      credentialPolicy: "CAPTURED" as const,
    };
    nativeJarCookie = COOKIE_B;

    await executeMobileApiRequest(
      "/api/media/customer/profile",
      { authenticated: true, method: "PUT" },
      capturedContext,
    );

    assert.deepEqual(requests, [
      {
        credentials: "omit",
        cookie: COOKIE_A,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gate 7B captured runner rejects cookie and authorization overrides before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse({ data: null });
  };

  try {
    const forbiddenHeaders: Array<Record<string, string>> = [
      { cookie: COOKIE_B },
      { Cookie: COOKIE_B },
      { authorization: "Bearer forged" },
      { AUTHORIZATION: "Bearer forged" },
    ];
    for (const headers of forbiddenHeaders) {
      await assert.rejects(
        executeCapturedRequest({ headers }),
        /do not accept credential headers/,
      );
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function executeCapturedRequest(options: MobileApiRequestOptions) {
  return executeMobileApiRequest(
    "/api/media/customer/profile",
    options,
    {
      apiBaseUrl: API_BASE_URL,
      cookie: COOKIE_A,
      credentialPolicy: "CAPTURED",
    },
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
