import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { decodePaymentCursor, encodePaymentCursor, paymentCursorBinding } from "../../../features/payments/domain/cursor";
import { PAYMENT_CURSOR_SIGNING_INFO, setPaymentCursorSigningSecretForTests } from "../../../features/payments/domain/cursor-signing";
import { PaymentDomainError } from "../../../features/payments/domain/errors";

test("payment cursor domains are distinct and preserve six PostgreSQL microseconds", () => {
  setPaymentCursorSigningSecretForTests("gate5c-cursor-secret-with-sufficient-entropy-1234567890");
  const scope = paymentCursorBinding({ kind: "customer", personId: randomUUID() });
  const filter = paymentCursorBinding({ status: "CAPTURED" });
  const cursor = encodePaymentCursor("INTENT", {
    filter,
    id: randomUUID(),
    pageSize: 20,
    scope,
    snapshot: "2026-07-20T12:00:00.123456Z",
    sortValue: "2026-07-20T11:59:59.999999Z",
  });
  const decoded = decodePaymentCursor("INTENT", cursor, { filter, pageSize: 20, scope }, "2026-07-20T12:00:01.000000Z");
  assert.equal(decoded.snapshot, "2026-07-20T12:00:00.123456Z");
  assert.equal(decoded.sortValue, "2026-07-20T11:59:59.999999Z");
  assert.throws(() => decodePaymentCursor("INTENT", cursor, { filter, pageSize: 10, scope }, "2026-07-20T12:00:01.000000Z"), cursorError);
  assert.throws(() => decodePaymentCursor("INTENT", cursor, { filter, pageSize: 20, scope: paymentCursorBinding({ foreign: true }) }, "2026-07-20T12:00:01.000000Z"), cursorError);
  assert.throws(() => decodePaymentCursor("REFUND", cursor, { filter, pageSize: 20, scope }, "2026-07-20T12:00:01.000000Z"), cursorError);
  assert.equal(new Set(Object.values(PAYMENT_CURSOR_SIGNING_INFO)).size, 4);
  assert.ok(Object.values(PAYMENT_CURSOR_SIGNING_INFO).every((domain) => domain.startsWith("rezno:payments:")));
  setPaymentCursorSigningSecretForTests(undefined);
});

function cursorError(error: unknown) {
  return error instanceof PaymentDomainError && error.code === "INVALID_CURSOR";
}
