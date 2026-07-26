import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HostedPaymentCoordinator,
  shouldHandleInitialHostedPaymentUrl,
} from "../../../apps/mobile/src/payments/hosted-payment-coordinator";
import {
  assertApprovedHostedCheckoutUrl,
  createHostedPaymentRecoveryManifest,
  HostedPaymentPolicyError,
  parseHostedPaymentRecoveryManifest,
  parseHostedPaymentReturnUrl,
  validateHostedPaymentHandoff,
  type HostedPaymentRecoveryManifest,
} from "../../../apps/mobile/src/payments/hosted-payment-policy";
import type {
  MobileHostedPaymentHandoff,
  MobilePaymentIntent,
} from "../../../apps/mobile/src/types/payments";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "10000000-0000-4000-8000-000000000002";
const INTENT = "20000000-0000-4000-8000-000000000001";
const OTHER_INTENT = "20000000-0000-4000-8000-000000000002";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const IDEMPOTENCY = "40000000-0000-4000-8000-000000000001";
const STATE = "a".repeat(64);
const CHECKOUT_ORIGIN = "https://checkout.rezno.example";
const NOW = Date.parse("2026-07-26T12:00:00.000Z");

test("Gate 7C checkout and return policies use exact allowlists and strict link shapes", () => {
  assert.match(
    assertApprovedHostedCheckoutUrl(
      `${CHECKOUT_ORIGIN}/session?reference=safe`,
      [CHECKOUT_ORIGIN],
    ),
    /^https:\/\/checkout\.rezno\.example\/session/,
  );
  for (const value of [
    "https://example.com/session",
    "https://checkout.rezno.example.attacker.invalid/session",
    "https://user@checkout.rezno.example/session",
    "https://checkout.rezno.example:444/session",
    "http://checkout.rezno.example/session",
    "https://checkout.rezno.example/session#fragment",
  ]) {
    assert.throws(
      () => assertApprovedHostedCheckoutUrl(value, [CHECKOUT_ORIGIN]),
      code("UNAPPROVED_CHECKOUT"),
    );
  }
  assert.throws(
    () =>
      assertApprovedHostedCheckoutUrl(
        `${CHECKOUT_ORIGIN}/session`,
        [],
      ),
    code("UNAPPROVED_CHECKOUT"),
  );

  const parsed = parseHostedPaymentReturnUrl(
    returnUrl(INTENT, "success"),
  );
  assert.deepEqual(parsed, {
    intentId: INTENT,
    outcome: "success",
    state: STATE,
  });
  for (const value of [
    `rezno://evil/return?intentId=${INTENT}&outcome=success&state=${STATE}`,
    `rezno://payments/other?intentId=${INTENT}&outcome=success&state=${STATE}`,
    `https://payments/return?intentId=${INTENT}&outcome=success&state=${STATE}`,
    `${returnUrl(INTENT, "success")}&next=https://attacker.invalid`,
    `${returnUrl(INTENT, "success")}&state=${STATE}`,
    `rezno://payments/return?intentId=${INTENT}&outcome=paid&state=${STATE}`,
    `rezno://payments/return?intentId=${INTENT}&outcome=success&state=short`,
  ]) {
    assert.throws(
      () => parseHostedPaymentReturnUrl(value),
      code("INVALID_RETURN_URL"),
    );
  }
});

test("Gate 7C validates all server handoff fields and recovery ownership", () => {
  const handoff = hostedHandoff();
  assert.equal(
    validateHostedPaymentHandoff(handoff, {
      approvedOrigins: [CHECKOUT_ORIGIN],
      intentId: INTENT,
      now: NOW,
    }),
    handoff,
  );
  assert.throws(
    () =>
      validateHostedPaymentHandoff(
        { ...handoff, intentId: OTHER_INTENT },
        {
          approvedOrigins: [CHECKOUT_ORIGIN],
          intentId: INTENT,
          now: NOW,
        },
      ),
    code("INVALID_HANDOFF"),
  );
  const manifest = createHostedPaymentRecoveryManifest({
    handoff,
    idempotencyKey: IDEMPOTENCY,
    now: NOW,
    operationId: OPERATION,
    ownerId: OWNER,
  });
  assert.deepEqual(
    parseHostedPaymentRecoveryManifest(JSON.stringify(manifest), {
      approvedOrigins: [CHECKOUT_ORIGIN],
      now: NOW,
      ownerId: OWNER,
    }),
    manifest,
  );
  assert.throws(
    () =>
      parseHostedPaymentRecoveryManifest(JSON.stringify(manifest), {
        approvedOrigins: [CHECKOUT_ORIGIN],
        now: NOW,
        ownerId: OTHER_OWNER,
      }),
    code("INVALID_RECOVERY"),
  );
  assert.throws(
    () =>
      parseHostedPaymentRecoveryManifest(
        JSON.stringify({ ...manifest, extra: "unsafe" }),
        {
          approvedOrigins: [CHECKOUT_ORIGIN],
          now: NOW,
          ownerId: OWNER,
        },
      ),
    code("INVALID_RECOVERY"),
  );
  for (const changed of [
    {
      ...manifest,
      checkoutUrl: "https://attacker.invalid/session",
    },
    {
      ...manifest,
      expiresAt: manifest.createdAt + 10 * 60 * 1_000,
    },
    {
      ...manifest,
      checkpoint: "VERIFYING_STATUS",
    },
  ]) {
    assert.throws(
      () =>
        parseHostedPaymentRecoveryManifest(JSON.stringify(changed), {
          approvedOrigins: [CHECKOUT_ORIGIN],
          now: NOW,
          ownerId: OWNER,
        }),
      code("INVALID_RECOVERY"),
    );
  }
});

test("Gate 7C warm return is single-flight, consumes once, and trusts server status over link outcome", async () => {
  const browser = deferred<{ type: string; url?: string }>();
  const harness = coordinatorHarness({
    browser: () => browser.promise,
    consume: async () => payment("FAILED"),
  });
  await harness.coordinator.bootstrap(OWNER);
  const started = harness.coordinator.start(OWNER, INTENT);
  await until(() => harness.stored?.checkpoint === "WAITING_RETURN");
  const runnerId = harness.coordinator.getSnapshot(OWNER).runnerId;
  assert.ok(runnerId);

  const duplicate = await harness.coordinator.start(OWNER, INTENT);
  assert.equal(duplicate, "ACTIVE");
  harness.setSessionOwner(OTHER_OWNER);
  const handled = harness.coordinator.handleUrl(
    OWNER,
    returnUrl(INTENT, "success"),
  );
  await handled;
  assert.equal(harness.calls.consume, 1);
  assert.equal(harness.calls.create, 1);
  assert.equal(harness.calls.cleanup, 1);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "DECLINED");

  browser.resolve({ type: "success", url: returnUrl(INTENT, "success") });
  await started;
  assert.equal(harness.calls.consume, 1);
  assert.equal(harness.calls.create, 1);
  assert.equal(harness.calls.browser, 1);
  assert.deepEqual(harness.sessionActors.create, [OWNER]);
  assert.deepEqual(harness.sessionActors.consume, [OWNER]);
  assert.equal(harness.coordinator.getSnapshot(OWNER).runnerId, null);
});

test("Gate 7C failure hint cannot override a server-authoritative capture", async () => {
  const harness = coordinatorHarness({
    browser: async () => ({
      type: "success",
      url: returnUrl(INTENT, "failure"),
    }),
    consume: async () => payment("CAPTURED"),
  });
  await harness.coordinator.bootstrap(OWNER);
  await harness.coordinator.start(OWNER, INTENT);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CONFIRMED");
  assert.equal(harness.coordinator.getSnapshot(OWNER).payment?.status, "CAPTURED");
  assert.equal(harness.stored, null);
});

test("Gate 7C rejects cross-order, tampered, and replayed links before duplicate server work", async () => {
  const browser = deferred<{ type: string; url?: string }>();
  const harness = coordinatorHarness({
    browser: () => browser.promise,
    consume: async () => payment("CAPTURED"),
  });
  await harness.coordinator.bootstrap(OWNER);
  const started = harness.coordinator.start(OWNER, INTENT);
  await until(() => Boolean(harness.stored));
  await harness.coordinator.handleUrl(
    OWNER,
    returnUrl(OTHER_INTENT, "success"),
  );
  await harness.coordinator.handleUrl(
    OWNER,
    returnUrl(INTENT, "success", "b".repeat(64)),
  );
  assert.equal(harness.calls.consume, 0);
  assert.equal(harness.stored?.returnReceivedAt, null);

  await harness.coordinator.handleUrl(
    OWNER,
    returnUrl(INTENT, "success"),
  );
  assert.equal(harness.calls.consume, 1);
  await harness.coordinator.handleUrl(
    OWNER,
    returnUrl(INTENT, "success"),
  );
  assert.equal(harness.calls.consume, 1);
  browser.resolve({ type: "dismiss" });
  await started;
});

test("Gate 7C cold-start recovery resumes bounded verification without reopening checkout", async () => {
  const manifest = {
    ...manifestForRecovery(),
    checkpoint: "VERIFYING_STATUS" as const,
    outcome: "success" as const,
    returnReceivedAt: NOW + 1_000,
  };
  const harness = coordinatorHarness({
    initial: manifest,
    consume: async () => payment("REQUIRES_ACTION"),
    get: async () => payment("REQUIRES_ACTION"),
  });
  await harness.coordinator.bootstrap(OWNER);
  assert.equal(harness.calls.browser, 0);
  assert.equal(harness.calls.consume, 1);
  assert.equal(harness.calls.get, 2);
  assert.equal(harness.calls.wait, 2);
  assert.equal(harness.stored?.verificationAttempts, 3);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).status,
    "PENDING_CONFIRMATION",
  );
});

test("Gate 7C restart recovers a lost consume response through read-only authoritative status", async () => {
  const manifest = {
    ...manifestForRecovery(),
    checkpoint: "VERIFYING_STATUS" as const,
    outcome: "cancel" as const,
    returnReceivedAt: NOW + 1_000,
  };
  const harness = coordinatorHarness({
    initial: manifest,
    consume: async () => {
      throw Object.assign(new Error("already consumed"), {
        code: "PAYMENT_STATE_CONFLICT",
        status: 409,
      });
    },
    get: async () => payment("CAPTURED"),
  });
  await harness.coordinator.bootstrap(OWNER);
  assert.equal(harness.calls.browser, 0);
  assert.equal(harness.calls.get, 1);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CONFIRMED");
  assert.equal(harness.stored, null);
});

test("Gate 7C cold-start initial link cannot overwrite recovered authoritative status", async () => {
  const manifest = {
    ...manifestForRecovery(),
    checkpoint: "VERIFYING_STATUS" as const,
    outcome: "success" as const,
    returnReceivedAt: NOW + 1_000,
  };
  const harness = coordinatorHarness({
    initial: manifest,
    consume: async () => payment("CAPTURED"),
  });

  await harness.coordinator.bootstrap(OWNER);
  const recovered = harness.coordinator.getSnapshot(OWNER);
  assert.equal(recovered.status, "CONFIRMED");
  assert.equal(recovered.manifest, null);
  assert.equal(shouldHandleInitialHostedPaymentUrl(recovered), false);

  if (shouldHandleInitialHostedPaymentUrl(recovered)) {
    await harness.coordinator.handleUrl(
      OWNER,
      returnUrl(INTENT, "success"),
    );
  }
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CONFIRMED");
  assert.equal(harness.calls.consume, 1);

  await harness.coordinator.handleUrl(
    OWNER,
    returnUrl(INTENT, "success"),
  );
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CONFIRMED");
  assert.equal(harness.calls.consume, 1);
});

test("Gate 7C cold-start handles only a return that is still awaiting consumption", async () => {
  const harness = coordinatorHarness({
    initial: manifestForRecovery(),
    consume: async () => payment("CAPTURED"),
  });

  await harness.coordinator.bootstrap(OWNER);
  const waiting = harness.coordinator.getSnapshot(OWNER);
  assert.equal(waiting.status, "WAITING_RETURN");
  assert.equal(shouldHandleInitialHostedPaymentUrl(waiting), true);

  await harness.coordinator.handleUrl(
    OWNER,
    returnUrl(INTENT, "success"),
  );
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CONFIRMED");
  assert.equal(harness.calls.consume, 1);
});

test("Gate 7C browser cancellation keeps a recoverable one-operation manifest", async () => {
  const harness = coordinatorHarness({
    browser: async () => ({ type: "cancel" }),
  });
  await harness.coordinator.bootstrap(OWNER);
  await harness.coordinator.start(OWNER, INTENT);
  const snapshot = harness.coordinator.getSnapshot(OWNER);
  assert.equal(snapshot.status, "BROWSER_CANCELLED");
  assert.equal(snapshot.pending, false);
  assert.equal(snapshot.runnerId, null);
  assert.equal(harness.stored?.checkpoint, "WAITING_RETURN");
  assert.equal(harness.calls.consume, 0);
});

test("Gate 7C account switch quiesces the old browser runner before recovery", async () => {
  const firstBrowserOpened = deferred<void>();
  const firstBrowserAborted = deferred<void>();
  const harness = coordinatorHarness({
    browser: async (signal) => {
      if (harness.calls.browser === 1) firstBrowserOpened.resolve();
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      if (harness.calls.browser === 1) firstBrowserAborted.resolve();
      throw new DOMException("cancelled", "AbortError");
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  const oldStart = harness.coordinator.start(OWNER, INTENT);
  await firstBrowserOpened.promise;
  const oldRunnerId = harness.coordinator.getSnapshot(OWNER).runnerId;
  assert.ok(oldRunnerId);

  await harness.coordinator.bootstrap(OTHER_OWNER);
  await firstBrowserAborted.promise;
  await oldStart;
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).runnerId, null);
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).pending, false);

  harness.setSessionOwner(OTHER_OWNER);
  const newStart = harness.coordinator.start(OTHER_OWNER, INTENT);
  await until(() => harness.calls.browser === 2);
  assert.notEqual(
    harness.coordinator.getSnapshot(OTHER_OWNER).runnerId,
    oldRunnerId,
  );
  assert.equal(harness.calls.create, 2);
  assert.equal(harness.calls.browser, 2);
  await harness.coordinator.bootstrap(OWNER);
  await newStart;
  assert.equal(harness.coordinator.getSnapshot(OWNER).runnerId, null);
});

test("Gate 7C expired recovery cleans SecureStore state and never resumes", async () => {
  const harness = coordinatorHarness({
    initial: {
      ...manifestForRecovery(),
      expiresAt: NOW - 1,
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  assert.equal(harness.calls.cleanup, 1);
  assert.equal(harness.calls.consume, 0);
  assert.equal(harness.calls.browser, 0);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "EXPIRED");
});

test("Gate 7C source does not log checkout URLs, state, cookies, or payment claims", async () => {
  const source = await Promise.all([
    readFile(
      "apps/mobile/src/payments/hosted-payment-coordinator.ts",
      "utf8",
    ),
    readFile("apps/mobile/src/payments/hosted-payment-runtime.ts", "utf8"),
    readFile(
      "apps/mobile/src/components/hosted-payment-controller.tsx",
      "utf8",
    ),
  ]);
  const combined = source.join("\n");
  assert.doesNotMatch(combined, /console\.(?:debug|error|info|log|warn)/);
  assert.doesNotMatch(combined, /credentials:\s*["']include["']/);
  assert.doesNotMatch(
    combined,
    /status:\s*["']CONFIRMED["'][\s\S]*outcome/,
  );
});

function coordinatorHarness(options: {
  browser?: (
    signal: AbortSignal,
  ) => Promise<{ type: string; url?: string }>;
  consume?: () => Promise<MobilePaymentIntent>;
  get?: () => Promise<MobilePaymentIntent>;
  initial?: HostedPaymentRecoveryManifest | null;
} = {}) {
  let uuidCounter = 10;
  const calls = {
    browser: 0,
    cleanup: 0,
    consume: 0,
    create: 0,
    get: 0,
    persist: 0,
    wait: 0,
  };
  let sessionOwner = OWNER;
  const harness: {
    calls: typeof calls;
    coordinator: HostedPaymentCoordinator;
    sessionActors: {
      consume: string[];
      create: string[];
      get: string[];
    };
    setSessionOwner(ownerId: string): void;
    stored: HostedPaymentRecoveryManifest | null;
  } = {
    calls,
    coordinator: null as never,
    sessionActors: {
      consume: [],
      create: [],
      get: [],
    },
    setSessionOwner(ownerId) {
      sessionOwner = ownerId;
    },
    stored: options.initial ?? null,
  };
  const dependencies: ConstructorParameters<
    typeof HostedPaymentCoordinator
  >[0] = {
    approvedOrigins: [CHECKOUT_ORIGIN],
    captureApiSession() {
      const capturedOwner = sessionOwner;
      return {
        async consumeReturn() {
          calls.consume += 1;
          harness.sessionActors.consume.push(capturedOwner);
          return options.consume?.() ?? payment("CAPTURED");
        },
        async createHandoff() {
          calls.create += 1;
          harness.sessionActors.create.push(capturedOwner);
          return hostedHandoff();
        },
        async getIntent() {
          calls.get += 1;
          harness.sessionActors.get.push(capturedOwner);
          return options.get?.() ?? payment("CAPTURED");
        },
      };
    },
    async cleanup(manifest) {
      calls.cleanup += 1;
      if (harness.stored?.operationId === manifest.operationId) {
        harness.stored = null;
      }
    },
    createAbortController: () => new AbortController(),
    async load(ownerId) {
      if (harness.stored && harness.stored.ownerId !== ownerId) return null;
      return harness.stored;
    },
    now: () => NOW,
    async openBrowser(_checkoutUrl, _returnUrl, signal) {
      calls.browser += 1;
      return options.browser?.(signal) ?? { type: "cancel" };
    },
    async persist(manifest) {
      calls.persist += 1;
      harness.stored = structuredClone(manifest);
    },
    uuid() {
      uuidCounter += 1;
      return `50000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
    },
    async wait() {
      calls.wait += 1;
    },
  };
  harness.coordinator = new HostedPaymentCoordinator(dependencies);
  return harness;
}

function hostedHandoff(): MobileHostedPaymentHandoff {
  return {
    checkoutUrl: `${CHECKOUT_ORIGIN}/session?reference=safe`,
    expiresAt: new Date(NOW + 4 * 60 * 1_000).toISOString(),
    intentId: INTENT,
    kind: "HOSTED_PAYMENT_HANDOFF",
    returnUrls: {
      cancel: returnUrl(INTENT, "cancel"),
      failure: returnUrl(INTENT, "failure"),
      success: returnUrl(INTENT, "success"),
    },
    state: STATE,
  };
}

function manifestForRecovery() {
  return createHostedPaymentRecoveryManifest({
    handoff: hostedHandoff(),
    idempotencyKey: IDEMPOTENCY,
    now: NOW,
    operationId: OPERATION,
    ownerId: OWNER,
  });
}

function returnUrl(
  intentId: string,
  outcome: "cancel" | "failure" | "success",
  state = STATE,
) {
  return `rezno://payments/return?intentId=${intentId}&outcome=${outcome}&state=${state}`;
}

function payment(status: string): MobilePaymentIntent {
  return {
    action: status === "REQUIRES_ACTION"
      ? {
          expiresAt: new Date(NOW + 60_000).toISOString(),
          kind: "PROVIDER_ACTION",
          reference: "safe",
        }
      : null,
    amount: "1000.000",
    attempts: [],
    capturedAmount: status === "CAPTURED" ? "1000.000" : "0.000",
    createdAt: new Date(NOW - 60_000).toISOString(),
    currency: "IQD",
    expiresAt: new Date(NOW + 60_000).toISOString(),
    id: INTENT,
    kind: "PAYMENT_INTENT",
    provider: { displayName: "Provider", kind: "DETERMINISTIC_TEST" },
    refundableAmount: status === "CAPTURED" ? "1000.000" : "0.000",
    refundedAmount: "0.000",
    refunds: [],
    status,
    target: { id: "60000000-0000-4000-8000-000000000001", kind: "ORDER" },
    updatedAt: new Date(NOW).toISOString(),
    version: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("Condition did not become true.");
}

function code(expected: string) {
  return (error: unknown) =>
    error instanceof HostedPaymentPolicyError && error.code === expected;
}
