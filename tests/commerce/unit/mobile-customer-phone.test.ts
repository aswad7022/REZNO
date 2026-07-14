import assert from "node:assert/strict";
import test from "node:test";

import { validateCustomerPhone } from "../../../features/onboarding/services/customer-phone";

test("mobile customer phone validation normalizes supported international and local formats", () => {
  assert.deepEqual(validateCustomerPhone(" +964 (750) 000-0000 "), {
    ok: true,
    value: "+9647500000000",
  });
  assert.deepEqual(validateCustomerPhone("0750 000 0000"), {
    ok: true,
    value: "07500000000",
  });
});

test("mobile customer phone validation rejects missing, malformed, and oversized values", () => {
  assert.deepEqual(validateCustomerPhone(undefined), {
    code: "PHONE_REQUIRED",
    ok: false,
  });
  assert.deepEqual(validateCustomerPhone(""), {
    code: "PHONE_REQUIRED",
    ok: false,
  });
  assert.deepEqual(validateCustomerPhone("+964-call-me"), {
    code: "PHONE_INVALID",
    ok: false,
  });
  assert.deepEqual(validateCustomerPhone("123456"), {
    code: "PHONE_INVALID",
    ok: false,
  });
  assert.deepEqual(validateCustomerPhone("1234567890123456"), {
    code: "PHONE_INVALID",
    ok: false,
  });
});
