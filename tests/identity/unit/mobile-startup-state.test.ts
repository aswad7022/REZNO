import assert from "node:assert/strict";
import test from "node:test";

import {
  completeInformationalWelcome,
  resolveAuthenticatedStartup,
  resolveGuestStartup,
  resolveStartupError,
  signedOutStartup,
  startupWelcomeCompleted,
  toMobileAuthSession,
  type MobileStartupUser,
} from "../../../apps/mobile/src/onboarding/startup-state";
import {
  persistWelcomeCompletedTo,
  readWelcomeCompletedFrom,
  WELCOME_COMPLETED_KEY,
  type WelcomePreferenceStorage,
} from "../../../apps/mobile/src/onboarding/welcome-preference-core";

const firstUser: MobileStartupUser = {
  email: "first@rezno.invalid",
  id: "first",
  name: "First",
};
const secondUser: MobileStartupUser = {
  email: "second@rezno.invalid",
  id: "second",
  name: "Second",
};

function memoryStorage(): WelcomePreferenceStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("fresh install and returning guest use only the local presentation preference", async () => {
  const storage = memoryStorage();
  assert.equal(await readWelcomeCompletedFrom(storage), false);

  const fresh = resolveGuestStartup(false);
  assert.equal(fresh.kind, "GUEST_WELCOME_NOT_COMPLETED");
  assert.equal(toMobileAuthSession(fresh).status, "unauthenticated");

  const completed = completeInformationalWelcome(fresh);
  await persistWelcomeCompletedTo(storage);
  assert.equal(storage.values.get(WELCOME_COMPLETED_KEY), "completed");
  assert.equal(completed.kind, "GUEST_WELCOME_COMPLETED");
  assert.equal(await readWelcomeCompletedFrom(storage), true);
  assert.equal(resolveGuestStartup(true).kind, "GUEST_WELCOME_COMPLETED");
});

test("server profile status remains authoritative for authenticated accounts", () => {
  const completeWithFreshLocalState = resolveAuthenticatedStartup(
    firstUser,
    true,
    false,
  );
  assert.equal(
    completeWithFreshLocalState.kind,
    "AUTHENTICATED_PROFILE_COMPLETE",
  );
  assert.equal(toMobileAuthSession(completeWithFreshLocalState).status, "authenticated");

  const incompleteWithCompletedWelcome = resolveAuthenticatedStartup(
    firstUser,
    false,
    true,
  );
  assert.equal(
    incompleteWithCompletedWelcome.kind,
    "AUTHENTICATED_PROFILE_INCOMPLETE",
  );
});

test("loading, failure, retry, sign-out, and account switching are explicit", () => {
  assert.deepEqual(toMobileAuthSession({ kind: "BOOTSTRAPPING" }), {
    status: "loading",
  });

  const failure = resolveStartupError(true, firstUser);
  assert.equal(failure.kind, "AUTH_ERROR_RETRYABLE");
  assert.equal(toMobileAuthSession(failure).status, "error");
  assert.equal(startupWelcomeCompleted(failure), true);

  const retried = resolveAuthenticatedStartup(firstUser, true, true);
  assert.equal(retried.kind, "AUTHENTICATED_PROFILE_COMPLETE");

  const signedOut = signedOutStartup(retried);
  assert.equal(signedOut.kind, "GUEST_WELCOME_COMPLETED");

  const switching = { kind: "BOOTSTRAPPING" } as const;
  assert.equal(toMobileAuthSession(switching).status, "loading");
  const secondAccount = resolveAuthenticatedStartup(secondUser, false, true);
  assert.equal(secondAccount.kind, "AUTHENTICATED_PROFILE_INCOMPLETE");
  const secondSession = toMobileAuthSession(secondAccount);
  assert.equal(
    secondSession.status === "authenticated" && secondSession.user.id,
    "second",
  );
});
