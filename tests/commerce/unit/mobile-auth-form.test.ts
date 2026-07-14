import assert from "node:assert/strict";
import test from "node:test";

import {
  validateMobileAuthForm,
  type MobileAuthFormValues,
} from "../../../apps/mobile/src/auth/form";

const validValues: MobileAuthFormValues = {
  email: "customer@example.com",
  name: "REZNO Customer",
  password: "safe-password",
  phone: "+964 750 000 0000",
};

test("mobile auth normalizes safe identity fields without changing the password", () => {
  const result = validateMobileAuthForm("signup", {
    email: "  CUSTOMER@Example.com ",
    name: "  REZNO Customer  ",
    password: "  safe-password  ",
    phone: " +964 (750) 000-0000 ",
  });

  assert.deepEqual(result, {
    ok: true,
    values: {
      email: "customer@example.com",
      name: "REZNO Customer",
      password: "  safe-password  ",
      phone: "+9647500000000",
    },
  });
});

test("mobile sign-up requires a display name", () => {
  assert.deepEqual(
    validateMobileAuthForm("signup", { ...validValues, name: "  " }),
    { code: "NAME_REQUIRED", field: "name", ok: false },
  );
});

test("mobile sign-up requires a valid pickup phone", () => {
  assert.deepEqual(
    validateMobileAuthForm("signup", { ...validValues, phone: "  " }),
    { code: "PHONE_REQUIRED", field: "phone", ok: false },
  );
  assert.deepEqual(
    validateMobileAuthForm("signup", {
      ...validValues,
      phone: "+964-call-me",
    }),
    { code: "PHONE_INVALID", field: "phone", ok: false },
  );
  assert.deepEqual(
    validateMobileAuthForm("signup", { ...validValues, phone: "123456" }),
    { code: "PHONE_INVALID", field: "phone", ok: false },
  );
});

test("mobile sign-in does not require a display name or phone before session lookup", () => {
  assert.equal(
    validateMobileAuthForm("signin", {
      ...validValues,
      name: "",
      phone: "",
    }).ok,
    true,
  );
});

test("mobile auth rejects malformed email and short passwords", () => {
  assert.deepEqual(
    validateMobileAuthForm("signin", {
      ...validValues,
      email: "not-an-email",
    }),
    { code: "EMAIL_INVALID", field: "email", ok: false },
  );
  assert.deepEqual(
    validateMobileAuthForm("signin", { ...validValues, password: "short" }),
    { code: "PASSWORD_TOO_SHORT", field: "password", ok: false },
  );
});
