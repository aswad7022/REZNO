import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  PAYMENT_WEBHOOK_MAXIMUM_BYTES,
  readBoundedPaymentWebhookBody,
  readBoundedWebhook,
} from "../../../features/payments/api/validation";
import {
  assertPaymentWebhookRequestAllowed,
  setPaymentWebhookRateLimitConsumerForTests,
} from "../../../features/payments/api/webhook-guard";
import { PaymentDomainError } from "../../../features/payments/domain/errors";
import { DeterministicPaymentProvider } from "../../../features/payments/providers/deterministic";
import { setPaymentProviderForTests } from "../../../features/payments/providers/registry";

const MAXIMUM = PAYMENT_WEBHOOK_MAXIMUM_BYTES;

test("payment webhook streaming reader authoritatively bounds actual bytes", async (t) => {
  await t.test("empty body is rejected and one byte is accepted", async () => {
    await assert.rejects(
      readBoundedPaymentWebhookBody(streamRequest([]).request, MAXIMUM),
      paymentCode("VALIDATION_ERROR"),
    );
    const one = await readBoundedPaymentWebhookBody(streamRequest([bytes(1, 37)]).request, MAXIMUM);
    assert.deepEqual(one, bytes(1, 37));
  });

  await t.test("exactly 64 KiB is accepted with exact byte order", async () => {
    const first = bytes(12_345, 17);
    const second = bytes(MAXIMUM - first.byteLength, 93);
    const actual = await readBoundedPaymentWebhookBody(streamRequest([first, second]).request, MAXIMUM);
    assert.equal(actual.byteLength, MAXIMUM);
    assert.deepEqual(actual.subarray(0, first.byteLength), first);
    assert.deepEqual(actual.subarray(first.byteLength), second);
  });

  await t.test("one-chunk overflow cancels immediately and leaves trailing chunks unread", async () => {
    const { probe, request } = streamRequest([bytes(MAXIMUM + 1), bytes(1, 99)]);
    await assert.rejects(readBoundedPaymentWebhookBody(request, MAXIMUM), paymentCode("VALIDATION_ERROR"));
    assert.equal(probe.cancelCount, 1);
    assert.equal(probe.pullCount, 1);
  });

  await t.test("many-chunk overflow is bounded and cancels without reading beyond overflow", async () => {
    const chunks = [...Array.from({ length: 64 }, () => bytes(1_024, 11)), bytes(1, 12), bytes(1, 13)];
    const { probe, request } = streamRequest(chunks);
    await assert.rejects(readBoundedPaymentWebhookBody(request, MAXIMUM), paymentCode("VALIDATION_ERROR"));
    assert.equal(probe.cancelCount, 1);
    assert.equal(probe.pullCount, 65);
  });

  await t.test("absent Content-Length accepts legal actual bytes and rejects excessive bytes", async () => {
    const legal = streamRequest([bytes(32, 4)]);
    assert.equal((await readBoundedPaymentWebhookBody(legal.request, MAXIMUM)).byteLength, 32);
    const excessive = streamRequest([bytes(MAXIMUM), bytes(1)]);
    await assert.rejects(readBoundedPaymentWebhookBody(excessive.request, MAXIMUM), paymentCode("VALIDATION_ERROR"));
    assert.equal(excessive.probe.cancelCount, 1);
  });

  await t.test("a forged smaller Content-Length cannot bypass the streamed bound", async () => {
    const streamed = streamRequest([bytes(MAXIMUM), bytes(1), bytes(1)], { "content-length": "1" });
    await assert.rejects(readBoundedPaymentWebhookBody(streamed.request, MAXIMUM), paymentCode("VALIDATION_ERROR"));
    assert.equal(streamed.probe.cancelCount, 1);
    assert.equal(streamed.probe.pullCount, 2);
  });

  await t.test("an oversized declaration rejects before reading the stream", async () => {
    const streamed = streamRequest([bytes(1)], { "content-length": String(MAXIMUM + 1) });
    await assert.rejects(readBoundedPaymentWebhookBody(streamed.request, MAXIMUM), paymentCode("VALIDATION_ERROR"));
    assert.equal(streamed.probe.pullCount, 0);
    assert.equal(streamed.request.bodyUsed, false);
  });

  await t.test("malformed, negative, unsafe, and duplicate Content-Length are rejected pre-body", async () => {
    for (const value of ["not-a-number", "-1", "9007199254740992", "1, 2"]) {
      const streamed = streamRequest([bytes(1)], { "content-length": value });
      await assert.rejects(readBoundedPaymentWebhookBody(streamed.request, MAXIMUM), paymentCode("VALIDATION_ERROR"));
      assert.equal(streamed.probe.pullCount, 0, value);
      assert.equal(streamed.request.bodyUsed, false, value);
    }
  });

  await t.test("stream errors fail safely without leaking body or source errors", async () => {
    const leaked = "raw-sensitive-webhook-fragment";
    const streamed = streamRequest([bytes(3)], {}, { errorAfterChunks: 1, streamError: leaked });
    const error = await capturePaymentError(readBoundedPaymentWebhookBody(streamed.request, MAXIMUM));
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.doesNotMatch(error.message, new RegExp(leaked));
    assert.equal(streamed.request.bodyUsed, true);
  });

  await t.test("signature verification receives unchanged exact-size bytes", async () => {
    const secret = "gate5c-bounded-webhook-secret";
    const provider = new DeterministicPaymentProvider(secret);
    const now = new Date();
    const timestamp = String(Math.floor(now.getTime() / 1_000));
    const base = {
      amount: "12000.000",
      currency: "IQD",
      eventId: "bounded-exact-size-event",
      occurredAt: now.toISOString(),
      outcome: "CAPTURED",
      padding: "",
      providerReference: "bounded-exact-size-reference",
      safeCode: null,
    };
    const empty = Buffer.from(JSON.stringify(base));
    const raw = Buffer.from(JSON.stringify({ ...base, padding: "x".repeat(MAXIMUM - empty.byteLength) }));
    assert.equal(raw.byteLength, MAXIMUM);
    const signature = createHmac("sha256", secret).update(timestamp).update(".").update(raw).digest("hex");
    const streamed = streamRequest(
      [raw.subarray(0, 7_777), raw.subarray(7_777)],
      {
        "content-length": String(MAXIMUM),
        "x-payment-signature": signature,
        "x-payment-timestamp": timestamp,
      },
    );
    const input = await readBoundedWebhook(streamed.request);
    assert.deepEqual(Buffer.from(input.body), raw);
    assert.equal((await provider.verifyAndParseWebhook(input)).outcome, "READY");
  });

  await t.test("duplicate or malformed signature headers fail with one generic contract", async () => {
    for (const headers of [
      { "x-payment-signature": `${"0".repeat(64)}, ${"1".repeat(64)}`, "x-payment-timestamp": "1" },
      { "x-payment-signature": "not-hex", "x-payment-timestamp": "1" },
      { "x-payment-signature": "0".repeat(64), "x-payment-timestamp": "1, 2" },
      { "x-payment-signature": "0".repeat(64), "x-payment-timestamp": "not-a-time" },
    ]) {
      const error = await capturePaymentError(readBoundedWebhook(streamRequest([bytes(1)], headers).request));
      assert.equal(error.code, "WEBHOOK_INVALID_SIGNATURE");
      assert.equal(error.message, "Payment webhook could not be verified.");
    }
  });
});

test("payment webhook guard rejects before body ingestion", async (t) => {
  t.afterEach(() => {
    setPaymentProviderForTests(null);
    setPaymentWebhookRateLimitConsumerForTests();
  });

  await t.test("NOT_CONFIGURED rejects after the rate limit and before consuming the body", async () => {
    let rateLimitCalled = false;
    setPaymentWebhookRateLimitConsumerForTests(() => {
      rateLimitCalled = true;
      return { retryAfterSeconds: 0, success: true };
    });
    setPaymentProviderForTests(null);
    const streamed = webhookRouteRequest([bytes(32, 7)]);
    assert.throws(
      () => assertPaymentWebhookRequestAllowed(streamed.request, "webhooks.deterministic", "DETERMINISTIC_TEST"),
      paymentCode("PAYMENT_PROVIDER_NOT_CONFIGURED"),
    );
    assert.equal(rateLimitCalled, true);
    assert.equal(streamed.probe.pullCount, 0);
    assert.equal(streamed.request.bodyUsed, false);
  });

  await t.test("rate limiting is provider-route scoped, request-derived, and pre-body", async () => {
    let observedScope = "";
    let observedIdentifier = "";
    setPaymentProviderForTests(new DeterministicPaymentProvider("gate5c-route-rate-secret"));
    setPaymentWebhookRateLimitConsumerForTests((scope, identifier) => {
      observedScope = scope;
      observedIdentifier = identifier;
      return { retryAfterSeconds: 999, success: false };
    });
    const streamed = webhookRouteRequest([Buffer.from('{"eventId":"must-not-be-read"}')]);
    const error = capturePaymentErrorSync(
      () => assertPaymentWebhookRequestAllowed(streamed.request, "webhooks.deterministic", "DETERMINISTIC_TEST"),
    );
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.details?.retryAfterSeconds, 60);
    assert.equal(observedScope, "payments.webhooks.deterministic.deterministic_test");
    assert.match(observedIdentifier, /^fingerprint:[0-9a-f]{64}$/);
    assert.doesNotMatch(observedIdentifier, /event|must-not-be-read/);
    assert.equal(streamed.probe.pullCount, 0);
    assert.equal(streamed.request.bodyUsed, false);
  });

  await t.test("requests without a safe fingerprint share one bounded unidentified bucket", () => {
    let observedIdentifier = "";
    setPaymentProviderForTests(new DeterministicPaymentProvider("gate5c-unidentified-secret"));
    setPaymentWebhookRateLimitConsumerForTests((_scope, identifier) => {
      observedIdentifier = identifier;
      return { retryAfterSeconds: 0, success: true };
    });
    const streamed = streamRequest([bytes(1)]);
    assertPaymentWebhookRequestAllowed(streamed.request, "webhooks.deterministic", "DETERMINISTIC_TEST");
    assert.equal(observedIdentifier, "unidentified");
    assert.equal(streamed.probe.pullCount, 0);
  });

  await t.test("configured exact provider passes after the request-derived limit", () => {
    const provider = new DeterministicPaymentProvider("gate5c-route-verify-secret");
    setPaymentProviderForTests(provider);
    setPaymentWebhookRateLimitConsumerForTests(() => ({ retryAfterSeconds: 0, success: true }));
    const streamed = webhookRouteRequest([bytes(1)]);
    assert.doesNotThrow(
      () => assertPaymentWebhookRequestAllowed(streamed.request, "webhooks.deterministic", "DETERMINISTIC_TEST"),
    );
    assert.equal(streamed.probe.pullCount, 0);
    assert.equal(streamed.request.bodyUsed, false);
  });
});

function streamRequest(
  chunks: readonly Uint8Array[],
  headers: HeadersInit = {},
  options: { errorAfterChunks?: number; streamError?: string } = {},
) {
  const probe = { cancelCount: 0, pullCount: 0 };
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      probe.cancelCount += 1;
    },
    pull(controller) {
      probe.pullCount += 1;
      if (options.errorAfterChunks === index) {
        controller.error(new Error(options.streamError ?? "stream failed"));
        return;
      }
      const chunk = chunks[index++];
      if (!chunk) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
  }, { highWaterMark: 0 });
  const request = new Request("https://rezno.invalid/payment-webhook", {
    body,
    duplex: "half",
    headers,
    method: "POST",
  } as RequestInit & { duplex: "half" });
  return { probe, request };
}

function webhookRouteRequest(chunks: readonly Uint8Array[]) {
  return streamRequest(chunks, {
    "user-agent": "rezno-bounded-webhook-test",
    "x-payment-signature": "0".repeat(64),
    "x-payment-timestamp": String(Math.floor(Date.now() / 1_000)),
  });
}

function bytes(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (seed + index) % 256);
}

function paymentCode(code: string) {
  return (error: unknown) => error instanceof PaymentDomainError && error.code === code;
}

async function capturePaymentError(promise: Promise<unknown>): Promise<PaymentDomainError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PaymentDomainError);
    return error;
  }
  assert.fail("Expected PaymentDomainError.");
}

function capturePaymentErrorSync(operation: () => unknown): PaymentDomainError {
  try {
    operation();
  } catch (error) {
    assert.ok(error instanceof PaymentDomainError);
    return error;
  }
  assert.fail("Expected PaymentDomainError.");
}
