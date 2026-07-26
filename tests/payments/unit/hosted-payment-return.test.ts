import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHostedCheckoutUrl,
  hostedPaymentReturnUrls,
  setHostedCheckoutPolicyForTests,
} from "../../../features/payments/domain/hosted-checkout";
import { parseHostedReturn } from "../../../features/payments/api/validation";
import {
  decodeHostedReturnState,
  encodeHostedReturnState,
  setHostedReturnSigningSecretForTests,
} from "../../../features/payments/domain/hosted-return-state";
import { PaymentDomainError } from "../../../features/payments/domain/errors";

const SECRET = "Gate7C-Hosted-Return-Unit-Secret-2026-Strong-Entropy";
const PERSON = "10000000-0000-4000-8000-000000000001";
const OTHER_PERSON = "10000000-0000-4000-8000-000000000002";
const INTENT = "20000000-0000-4000-8000-000000000001";
const OTHER_INTENT = "20000000-0000-4000-8000-000000000002";
const ATTEMPT = "30000000-0000-4000-8000-000000000001";
const HANDOFF = "40000000-0000-4000-8000-000000000001";
const NONCE = "50000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-26T12:00:00.000Z");

test.beforeEach(() => {
  setHostedReturnSigningSecretForTests(SECRET);
  setHostedCheckoutPolicyForTests(undefined);
});

test.after(() => {
  setHostedReturnSigningSecretForTests(undefined);
  setHostedCheckoutPolicyForTests(undefined);
});

test("Gate 7C hosted return state is signed, scoped, bounded, and tamper-evident", () => {
  const state = encodedState();
  assert.deepEqual(
    decodeHostedReturnState(state, {
      intentId: INTENT,
      now: NOW,
      personId: PERSON,
    }),
    {
      attemptId: ATTEMPT,
      expiresAt: Math.floor(NOW.getTime() / 1_000) + 300,
      handoffId: HANDOFF,
      intentId: INTENT,
      nonce: NONCE,
      version: 1,
    },
  );
  assert.throws(
    () =>
      decodeHostedReturnState(state, {
        intentId: OTHER_INTENT,
        now: NOW,
        personId: PERSON,
      }),
    paymentCode("VALIDATION_ERROR"),
  );
  assert.throws(
    () =>
      decodeHostedReturnState(state, {
        intentId: INTENT,
        now: NOW,
        personId: OTHER_PERSON,
      }),
    paymentCode("VALIDATION_ERROR"),
  );
  const tampered = `${state.slice(0, -1)}${state.endsWith("a") ? "b" : "a"}`;
  assert.throws(
    () =>
      decodeHostedReturnState(tampered, {
        intentId: INTENT,
        now: NOW,
        personId: PERSON,
      }),
    paymentCode("VALIDATION_ERROR"),
  );
  assert.throws(
    () =>
      decodeHostedReturnState(state, {
        intentId: INTENT,
        now: new Date(NOW.getTime() + 301_000),
        personId: PERSON,
      }),
    paymentCode("PAYMENT_STATE_CONFLICT"),
  );
});

test("Gate 7C checkout builder pins exact HTTPS origin and controlled return URLs", () => {
  const state = encodedState();
  const returnUrls = hostedPaymentReturnUrls(INTENT, state);
  const checkoutUrl = buildHostedCheckoutUrl({
    actionReference: "action_safe-1",
    policy: {
      approvedOrigins: ["https://checkout.rezno.example"],
      checkoutBaseUrl: "https://checkout.rezno.example/session",
      provider: "DETERMINISTIC_TEST",
    },
    returnUrls,
    state,
  });
  const checkout = new URL(checkoutUrl);
  assert.equal(checkout.origin, "https://checkout.rezno.example");
  assert.equal(checkout.pathname, "/session");
  assert.equal(checkout.searchParams.get("reference"), "action_safe-1");
  assert.equal(checkout.searchParams.get("success_url"), returnUrls.success);
  assert.equal(
    new URL(returnUrls.cancel).searchParams.get("outcome"),
    "cancel",
  );

  for (const policy of [
    {
      approvedOrigins: ["https://checkout.rezno.example"],
      checkoutBaseUrl: "https://attacker.invalid/session",
      provider: "DETERMINISTIC_TEST" as const,
    },
    {
      approvedOrigins: [],
      checkoutBaseUrl: "https://checkout.rezno.example/session",
      provider: "DETERMINISTIC_TEST" as const,
    },
    {
      approvedOrigins: ["https://checkout.rezno.example"],
      checkoutBaseUrl: "http://checkout.rezno.example/session",
      provider: "DETERMINISTIC_TEST" as const,
    },
  ]) {
    assert.throws(
      () =>
        buildHostedCheckoutUrl({
          actionReference: "action_safe-1",
          policy,
          returnUrls,
          state,
        }),
      paymentCode("PAYMENT_PROVIDER_NOT_CONFIGURED"),
    );
  }
  assert.throws(
    () =>
      buildHostedCheckoutUrl({
        actionReference: "https://attacker.invalid/steal",
        policy: {
          approvedOrigins: ["https://checkout.rezno.example"],
          checkoutBaseUrl: "https://checkout.rezno.example/session",
          provider: "DETERMINISTIC_TEST",
        },
        returnUrls,
        state,
      }),
    paymentCode("PAYMENT_PROVIDER_FAILURE"),
  );
});

test("Gate 7C bounds an undeclared streamed return body before JSON parsing", async () => {
  const oversizedState = "a".repeat(17 * 1024);
  const request = new Request("https://rezno.test/hosted-return", {
    body: JSON.stringify({ state: oversizedState }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(request.headers.get("content-length"), null);
  await assert.rejects(
    () => parseHostedReturn(request),
    paymentCode("VALIDATION_ERROR"),
  );
});

test("Gate 7C Migration 50 adds only the canonical hosted handoff action", async () => {
  const migration = await readFile(
    new URL(
      "../../../prisma/migrations/20260726173000_hosted_payment_handoff_action/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    migration.trim(),
    `ALTER TYPE "PaymentMutationAction" ADD VALUE 'CREATE_HOSTED_HANDOFF';`,
  );
  assert.doesNotMatch(migration, /CREATE TABLE|INSERT INTO|RUN_RECONCILIATION/u);
});

function encodedState() {
  return encodeHostedReturnState({
    attemptId: ATTEMPT,
    expiresAt: Math.floor(NOW.getTime() / 1_000) + 300,
    handoffId: HANDOFF,
    intentId: INTENT,
    nonce: NONCE,
    personId: PERSON,
  });
}

function paymentCode(expected: string) {
  return (error: unknown) =>
    error instanceof PaymentDomainError && error.code === expected;
}
