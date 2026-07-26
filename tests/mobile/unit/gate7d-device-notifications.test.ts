import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  MobilePushRegistrationCoordinator,
  type MobilePushRegistrationDependencies,
  type MobilePushRegistrationState,
} from "../../../apps/mobile/src/notifications/device-registration";
import { resolvePushNotificationDestination } from "../../../apps/mobile/src/notifications/notification-route-policy";

const identity = {
  installationId: "11111111-1111-4111-8111-111111111111",
  installationSecret: "A".repeat(43),
};
const nativeToken = {
  appVersion: "1.0.0",
  platform: "ANDROID" as const,
  provider: "FCM" as const,
  token: "fcm-token-that-is-long-enough-123456",
};

test("Gate 7D permission, registration, rotation, retry and owner fencing are deterministic", async (t) => {
  await t.test("undetermined and denied permission never read or register a token", async () => {
    for (const permission of ["UNDETERMINED", "DENIED"] as const) {
      let tokenReads = 0;
      let registrations = 0;
      const states: MobilePushRegistrationState[] = [];
      const coordinator = coordinatorWith({
        native: {
          readPermission: async () => permission,
          readToken: async () => {
            tokenReads += 1;
            return nativeToken;
          },
          requestPermission: async () => permission,
        },
        register: async () => {
          registrations += 1;
          return installationResult();
        },
      });
      coordinator.subscribe((state) => states.push(state));
      await coordinator.activate("owner-a");
      assert.equal(tokenReads, 0);
      assert.equal(registrations, 0);
      assert.equal(
        states.at(-1)?.kind,
        permission === "DENIED" ? "PERMISSION_DENIED" : "PERMISSION_REQUIRED",
      );
    }
  });

  await t.test("provisional permission registers once and token refresh rotates once", async () => {
    let registrations = 0;
    const inputs: unknown[] = [];
    const states: MobilePushRegistrationState[] = [];
    const coordinator = coordinatorWith({
      native: {
        readPermission: async () => "PROVISIONAL",
        readToken: async () => nativeToken,
        requestPermission: async () => "PROVISIONAL",
      },
      register: async (input) => {
        registrations += 1;
        inputs.push(input);
        return installationResult();
      },
    });
    coordinator.subscribe((state) => states.push(state));
    await coordinator.activate("owner-a");
    await coordinator.refreshToken("owner-a");
    assert.equal(registrations, 2);
    assert.deepEqual(inputs[0], {
      ...identity,
      ...nativeToken,
      operationGeneration: 1,
      permissionStatus: "PROVISIONAL",
    });
    assert.deepEqual(states.at(-1), {
      kind: "REGISTERED",
      permission: "PROVISIONAL",
    });
  });

  await t.test("permission revocation disables the server endpoint and reports partial failure", async () => {
    let revoked = 0;
    const states: MobilePushRegistrationState[] = [];
    const coordinator = coordinatorWith({
      captureApi() {
        return {
          register: async () => installationResult(),
          revoke: async () => {
            revoked += 1;
            if (revoked < 3) throw new Error("offline");
          },
        };
      },
      native: {
        readPermission: async () => "DENIED",
        readToken: async () => nativeToken,
        requestPermission: async () => "DENIED",
      },
    });
    coordinator.subscribe((state) => states.push(state));
    await coordinator.activate("owner-a");
    assert.equal(revoked, 2);
    assert.deepEqual(states.at(-1), {
      kind: "PERMISSION_DENIED",
      revocationPending: true,
    });
    await coordinator.activate("owner-a");
    assert.equal(revoked, 3);
    assert.deepEqual(states.at(-1), {
      kind: "PERMISSION_DENIED",
      revocationPending: false,
    });
  });

  await t.test("transient registration is bounded to three attempts", async () => {
    let registrations = 0;
    const idempotencyKeys: string[] = [];
    const operationGenerations: number[] = [];
    const sleeps: number[] = [];
    const states: MobilePushRegistrationState[] = [];
    const coordinator = coordinatorWith({
      register: async (input, idempotencyKey) => {
        registrations += 1;
        idempotencyKeys.push(idempotencyKey);
        operationGenerations.push(input.operationGeneration);
        throw new Error("offline");
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });
    coordinator.subscribe((state) => states.push(state));
    await coordinator.activate("owner-a");
    assert.equal(registrations, 3);
    assert.deepEqual(sleeps, [1_000, 4_000]);
    assert.equal(new Set(idempotencyKeys).size, 1);
    assert.deepEqual(operationGenerations, [1, 1, 1]);
    assert.deepEqual(states.at(-1), { kind: "UNAVAILABLE", retryable: true });
  });

  await t.test("late owner A completion cannot publish over owner B", async () => {
    const first = deferred<ReturnType<typeof installationResult>>();
    const firstStarted = deferred<void>();
    const states: MobilePushRegistrationState[] = [];
    let registrations = 0;
    const coordinator = coordinatorWith({
      register: async () => {
        registrations += 1;
        if (registrations === 1) {
          firstStarted.resolve();
          return first.promise;
        }
        return installationResult();
      },
    });
    coordinator.subscribe((state) => states.push(state));
    const ownerA = coordinator.activate("owner-a");
    await firstStarted.promise;
    const ownerB = coordinator.activate("owner-b");
    await ownerB;
    first.resolve(installationResult());
    await ownerA;
    assert.equal(registrations, 2);
    assert.deepEqual(states.at(-1), { kind: "REGISTERED", permission: "GRANTED" });
  });

  await t.test("logout revokes through the captured owner session and stale work stays fenced", async () => {
    const registration = deferred<ReturnType<typeof installationResult>>();
    let captured = 0;
    let revoked = 0;
    const coordinator = coordinatorWith({
      captureApi() {
        captured += 1;
        return {
          register: async () => registration.promise,
          revoke: async (input) => {
            revoked += 1;
            assert.deepEqual(input, {
              ...identity,
              operationGeneration: 2,
            });
          },
        };
      },
    });
    const active = coordinator.activate("owner-a");
    await Promise.resolve();
    await coordinator.deactivate("owner-a");
    registration.resolve(installationResult());
    await active;
    assert.equal(captured, 2);
    assert.equal(revoked, 1);
  });

  await t.test("logout fails closed when the old binding cannot be revoked", async () => {
    let revoked = 0;
    const idempotencyKeys: string[] = [];
    const coordinator = coordinatorWith({
      captureApi() {
        return {
          register: async () => installationResult(),
          revoke: async (_input, idempotencyKey) => {
            revoked += 1;
            idempotencyKeys.push(idempotencyKey);
            throw new Error("offline");
          },
        };
      },
    });
    await coordinator.activate("owner-a");
    await assert.rejects(
      coordinator.deactivate("owner-a"),
      /could not be revoked before logout/u,
    );
    assert.equal(revoked, 2);
    assert.equal(new Set(idempotencyKeys).size, 1);
  });
});

test("Gate 7D notification route policy rejects tampering and accepts exact destinations", () => {
  const targetId = randomUUID();
  assert.deepEqual(
    resolvePushNotificationDestination({
      destinationKind: "CUSTOMER_BOOKING",
      targetId,
    }),
    { kind: "CUSTOMER_BOOKING", targetId },
  );
  assert.deepEqual(
    resolvePushNotificationDestination({
      destinationKind: "NOTIFICATIONS",
      targetId: "",
    }),
    { kind: "NOTIFICATIONS", targetId: null },
  );
  for (const value of [
    { destinationKind: "CUSTOMER_BOOKING", targetId: null },
    { destinationKind: "CUSTOMER_BOOKING", targetId: "../foreign" },
    { destinationKind: "https://evil.invalid", targetId },
    { destinationKind: "BUSINESS_PAYMENTS", targetId },
    "rezno://payments/return",
  ]) {
    assert.equal(resolvePushNotificationDestination(value), null);
  }
});

function coordinatorWith(
  overrides: Partial<MobilePushRegistrationDependencies> & {
    register?: MobilePushRegistrationDependencies["captureApi"] extends () => infer T
      ? T extends { register: infer R } ? R : never
      : never;
  } = {},
) {
  let sequence = 0;
  let operationGeneration = 0;
  const register = overrides.register ?? (async () => installationResult());
  const dependencies: MobilePushRegistrationDependencies = {
    captureApi: overrides.captureApi ?? (() => ({
      register,
      revoke: async () => undefined,
    })),
    createIdempotencyKey:
      overrides.createIdempotencyKey
      ?? (() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`),
    identity: overrides.identity ?? {
      nextOperation: async () => ({
        ...identity,
        operationGeneration: ++operationGeneration,
      }),
    },
    native: overrides.native ?? {
      readPermission: async () => "GRANTED",
      readToken: async () => nativeToken,
      requestPermission: async () => "GRANTED",
    },
    sleep: overrides.sleep ?? (async () => undefined),
  };
  return new MobilePushRegistrationCoordinator(dependencies);
}

function installationResult() {
  return {
    installationId: identity.installationId,
    kind: "PUSH_INSTALLATION" as const,
    permissionStatus: "GRANTED" as const,
    platform: "ANDROID" as const,
    provider: "FCM" as const,
    registeredAt: "2026-07-26T00:00:00.000Z",
    replayed: false,
    status: "ACTIVE" as const,
    tokenVersion: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
