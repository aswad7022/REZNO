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
};

test("mobile auth normalizes safe identity fields without changing the password", () => {
  const result = validateMobileAuthForm("signup", {
    email: "  CUSTOMER@Example.com ",
    name: "  REZNO Customer  ",
    password: "  safe-password  ",
  });

  assert.deepEqual(result, {
    ok: true,
    values: {
      email: "customer@example.com",
      name: "REZNO Customer",
      password: "  safe-password  ",
    },
  });
});

test("mobile sign-up requires a display name", () => {
  assert.deepEqual(
    validateMobileAuthForm("signup", { ...validValues, name: "  " }),
    { code: "NAME_REQUIRED", field: "name", ok: false },
  );
});

test("mobile sign-in does not require a display name", () => {
  assert.equal(
    validateMobileAuthForm("signin", { ...validValues, name: "" }).ok,
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
