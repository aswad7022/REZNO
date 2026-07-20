import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PAYMENTS_GATE5C_EXCLUSIONS, PAYMENTS_STAGE6_WORKER_HANDOFF } from "../../../features/payments/domain/boundaries";
import { paymentCapabilities } from "../../../features/payments/domain/capabilities";
import { calculateBasisPointCommission, ZeroCommissionPolicy } from "../../../features/payments/domain/commission";
import { PaymentDomainError } from "../../../features/payments/domain/errors";
import { paymentRequestHash } from "../../../features/payments/domain/idempotency";
import { assertSamePaymentMoney, parsePaymentCurrency, paymentDecimal, paymentMoneyString } from "../../../features/payments/domain/money";
import {
  assertPaymentAttemptTransition,
  assertPaymentIntentTransition,
  assertPaymentRefundTransition,
  paymentIntentStatusForTotals,
  targetPaymentStatus,
} from "../../../features/payments/domain/state-machine";
import { DeterministicPaymentProvider } from "../../../features/payments/providers/deterministic";

test("Gate 5C currency registry uses exact IQD Decimal strings and rejects floating point", () => {
  assert.equal(parsePaymentCurrency("IQD"), "IQD");
  assert.throws(() => parsePaymentCurrency("USD"), paymentCode("PAYMENT_CURRENCY_MISMATCH"));
  assert.equal(paymentMoneyString("123456789.000"), "123456789.000");
  assert.equal(paymentMoneyString("1"), "1.000");
  assert.throws(() => paymentDecimal(0.1, "amount"), paymentCode("VALIDATION_ERROR"));
  assert.throws(() => paymentDecimal("1.001", "amount"), paymentCode("VALIDATION_ERROR"));
  assert.throws(() => paymentDecimal("0", "amount"), paymentCode("VALIDATION_ERROR"));
  assert.equal(paymentDecimal("0", "amount", { allowZero: true }).toFixed(3), "0.000");
  assert.doesNotThrow(() => assertSamePaymentMoney("1000.000", "1000"));
  assert.throws(() => assertSamePaymentMoney("1000", "1001"), paymentCode("PAYMENT_AMOUNT_MISMATCH"));
});

test("commission policies are deterministic, bounded, and exact", () => {
  assert.deepEqual(new ZeroCommissionPolicy().calculate("12500"), {
    amount: "0.000",
    basisPoints: 0,
    merchantNet: "12500.000",
    policyId: "zero-v1",
  });
  assert.deepEqual(calculateBasisPointCommission("10000", 250, "approved-v1"), {
    amount: "250.000",
    basisPoints: 250,
    merchantNet: "9750.000",
    policyId: "approved-v1",
  });
  assert.throws(() => calculateBasisPointCommission("1", 1, "fractional"), /fractional IQD/u);
  assert.throws(() => calculateBasisPointCommission("100", 10_001, "invalid"), /Invalid commission/u);
});

test("intent, attempt, and refund state machines reject invented transitions", () => {
  assert.doesNotThrow(() => assertPaymentIntentTransition("CREATED", "PROCESSING"));
  assert.doesNotThrow(() => assertPaymentIntentTransition("CAPTURED", "PARTIALLY_REFUNDED"));
  assert.throws(() => assertPaymentIntentTransition("REFUNDED", "CAPTURED"), paymentCode("PAYMENT_STATE_CONFLICT"));
  assert.doesNotThrow(() => assertPaymentAttemptTransition("PROCESSING", "CAPTURED"));
  assert.throws(() => assertPaymentAttemptTransition("FAILED", "PROCESSING"), paymentCode("PAYMENT_STATE_CONFLICT"));
  assert.doesNotThrow(() => assertPaymentRefundTransition("FAILED", "PROCESSING"));
  assert.throws(() => assertPaymentRefundTransition("SUCCEEDED", "FAILED"), paymentCode("REFUND_NOT_ALLOWED"));
});

test("target mappings distinguish unpaid, paid, partially refunded, refunded, and voided", () => {
  const decimal = (value: string) => paymentDecimal(value, "test", { allowZero: true });
  assert.equal(paymentIntentStatusForTotals({ amount: decimal("10"), capturedAmount: decimal("10"), refundedAmount: decimal("0") }), "CAPTURED");
  assert.equal(paymentIntentStatusForTotals({ amount: decimal("10"), capturedAmount: decimal("10"), refundedAmount: decimal("2") }), "PARTIALLY_REFUNDED");
  assert.equal(targetPaymentStatus({ amount: decimal("10"), capturedAmount: decimal("10"), refundedAmount: decimal("10"), status: "REFUNDED" }), "REFUNDED");
  assert.equal(targetPaymentStatus({ amount: decimal("10"), capturedAmount: decimal("0"), refundedAmount: decimal("0"), status: "CANCELLED" }), "VOIDED");
});

test("idempotency hashes are canonical and bind changed money", () => {
  assert.equal(paymentRequestHash({ b: 2, a: "1.000" }), paymentRequestHash({ a: "1.000", b: 2 }));
  assert.notEqual(paymentRequestHash({ amount: "1.000" }), paymentRequestHash({ amount: "2.000" }));
  assert.match(paymentRequestHash({ id: randomUUID() }), /^[a-f0-9]{64}$/u);
});

test("capabilities tell the truth when provider or Organization is disabled", () => {
  assert.equal(paymentCapabilities({ providerConfigured: false, organizationOnlinePaymentsEnabled: true }).onlinePaymentsAvailable, false);
  assert.equal(paymentCapabilities({ providerConfigured: true, organizationOnlinePaymentsEnabled: false }).onlinePaymentsAvailable, false);
  const enabled = paymentCapabilities({ providerConfigured: true, organizationOnlinePaymentsEnabled: true });
  assert.equal(enabled.onlinePaymentsAvailable, true);
  assert.deepEqual(enabled.supportedMethods, ["ONLINE_PROVIDER"]);
  assert.deepEqual(enabled.supportedCurrencies, ["IQD"]);
  assert.equal("credential" in enabled, false);
});

test("deterministic provider supports capture, action, authorization, failures, refunds, cancellation, and signed webhooks", async () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const provider = new DeterministicPaymentProvider("gate5c-test-webhook-secret", () => now);
  const input = {
    amount: "1000.000",
    currency: "IQD" as const,
    expiresAt: new Date(now.getTime() + 60_000),
    paymentIntentId: randomUUID(),
    providerRequestReference: "request-1",
  };
  assert.equal((await provider.createPayment(input)).outcome, "CAPTURED");
  assert.equal((await provider.createPayment(input)).outcome, "DUPLICATE");
  for (const [scenario, outcome] of [["REQUIRES_ACTION", "REQUIRES_ACTION"], ["AUTHORIZE", "AUTHORIZED"], ["TRANSIENT_FAILURE", "TRANSIENT_FAILURE"], ["PERMANENT_FAILURE", "PERMANENT_FAILURE"]] as const) {
    provider.configureDefaultScenario(scenario);
    assert.equal((await provider.createPayment({ ...input, paymentIntentId: randomUUID(), providerRequestReference: randomUUID() })).outcome, outcome);
  }
  provider.configureDefaultScenario("IMMEDIATE_CAPTURE");
  const captured = await provider.createPayment({ ...input, paymentIntentId: randomUUID(), providerRequestReference: "refund-source" });
  assert.ok(captured.providerReference);
  assert.equal((await provider.refundPayment({ amount: "400.000", currency: "IQD", paymentIntentId: input.paymentIntentId, providerReference: captured.providerReference!, providerRequestReference: "refund-1", refundId: randomUUID() })).outcome, "READY");
  assert.equal((await provider.cancelPayment({ paymentIntentId: input.paymentIntentId, providerReference: captured.providerReference!, providerRequestReference: "cancel-1" })).outcome, "PERMANENT_FAILURE");
  const event = { amount: "1000.000", currency: "IQD" as const, eventId: "event-1", occurredAt: now, outcome: "CAPTURED" as const, providerReference: captured.providerReference!, safeCode: null };
  const signed = provider.signWebhook(event);
  assert.equal((await provider.verifyAndParseWebhook({ ...signed, receivedAt: now })).outcome, "READY");
  assert.equal((await provider.verifyAndParseWebhook({ ...signed, signature: "0".repeat(64), receivedAt: now })).outcome, "INVALID_SIGNATURE");
  assert.equal((await provider.verifyAndParseWebhook({ ...signed, receivedAt: new Date(now.getTime() + 600_000) })).outcome, "INVALID_SIGNATURE");
});

test("Gate 5C boundaries preserve later provider, worker, AI, and launch work", () => {
  assert.ok(PAYMENTS_GATE5C_EXCLUSIONS.includes("REAL_PAYMENT_PROVIDER"));
  assert.ok(PAYMENTS_GATE5C_EXCLUSIONS.includes("CARD_DATA_COLLECTION"));
  assert.ok(PAYMENTS_GATE5C_EXCLUSIONS.includes("STAGE_6_JOBS_AND_WORKERS"));
  assert.deepEqual(PAYMENTS_STAGE6_WORKER_HANDOFF, [
    "provider-event queue consumption",
    "scheduled reconciliation",
    "scheduled settlement statement generation",
    "provider retry orchestration",
  ]);
});

function paymentCode(code: string) {
  return (error: unknown) => error instanceof PaymentDomainError && error.code === code;
}
