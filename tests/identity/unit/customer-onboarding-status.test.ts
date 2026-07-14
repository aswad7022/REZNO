import assert from "node:assert/strict";
import test from "node:test";

import { isMobileCustomerOnboardingComplete } from "../../../features/onboarding/services/customer-onboarding-status";

test("mobile profile status requires both server completion and a valid phone", async () => {
  for (const [person, expected] of [
    [{ isOnboarded: false, phone: "+9647500000000" }, false],
    [{ isOnboarded: true, phone: null }, false],
    [{ isOnboarded: true, phone: "+9647500000000" }, true],
  ] as const) {
    assert.equal(isMobileCustomerOnboardingComplete(person), expected);
  }
});
