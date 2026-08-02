import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  parsePushReceiptEvents,
  parseRegisterPushInstallation,
} from "../../../features/push-notifications/api/validation";
import {
  decryptPushToken,
  encryptPushToken,
  pushTokenFingerprint,
  verifyPushReceiptSignature,
} from "../../../features/push-notifications/domain/crypto";
import { PushNotificationDomainError } from "../../../features/push-notifications/domain/errors";
import { nativePushProviderConfigurationTruth } from "../../../features/push-notifications/providers/native";

const key = Buffer.alloc(32, 7).toString("base64");
const environment = {
  NODE_ENV: "test",
  REZNO_PUSH_TOKEN_ENCRYPTION_KEY: key,
  REZNO_PUSH_RECEIPT_HMAC_SECRET: "r".repeat(48),
} as NodeJS.ProcessEnv;
const installationId = "11111111-1111-4111-8111-111111111111";

test("Gate 7D push token storage is authenticated, bound, and redacted by fingerprint", () => {
  const token = "a".repeat(64);
  const ciphertext = encryptPushToken(
    { installationId, provider: "APNS", token },
    environment,
  );
  assert.equal(ciphertext.includes(token), false);
  assert.equal(
    decryptPushToken(
      { ciphertext, installationId, provider: "APNS" },
      environment,
    ),
    token,
  );
  assert.match(pushTokenFingerprint("APNS", token), /^[0-9a-f]{64}$/);
  assert.throws(
    () => decryptPushToken(
      {
        ciphertext,
        installationId: "22222222-2222-4222-8222-222222222222",
        provider: "APNS",
      },
      environment,
    ),
    (error) => error instanceof PushNotificationDomainError
      && error.code === "SERVICE_UNAVAILABLE",
  );
});

test("Gate 7D receipt authentication rejects unsigned and altered payloads", () => {
  const body = new TextEncoder().encode('{"events":[]}');
  const timestamp = "1785110400";
  const signature = `v1=${createHmac("sha256", environment.REZNO_PUSH_RECEIPT_HMAC_SECRET!)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("hex")}`;
  assert.equal(
    verifyPushReceiptSignature({ body, signature, timestamp }, environment),
    true,
  );
  assert.equal(
    verifyPushReceiptSignature({
      body: new TextEncoder().encode('{"events":[1]}'),
      signature,
      timestamp,
    }, environment),
    false,
  );
  assert.equal(
    verifyPushReceiptSignature({ body, signature: "", timestamp }, environment),
    false,
  );
});

test("Gate 7D registration and receipt bodies are strict and provider-bound", async () => {
  const body = {
    appVersion: "1.0.0",
    installationId,
    installationSecret: "A".repeat(43),
    operationGeneration: 1,
    permissionStatus: "GRANTED",
    platform: "IOS",
    provider: "APNS",
    token: "a".repeat(64),
  };
  const parsed = await parseRegisterPushInstallation(new Request("https://rezno.invalid", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "idempotency-key": "22222222-2222-4222-8222-222222222222",
    },
    method: "PUT",
  }));
  assert.equal(parsed.token.length, 64);
  await assert.rejects(
    parseRegisterPushInstallation(new Request("https://rezno.invalid", {
      body: JSON.stringify({ ...body, token: "fcm-token", extra: true }),
      headers: { "idempotency-key": "22222222-2222-4222-8222-222222222222" },
      method: "PUT",
    })),
    (error) => error instanceof PushNotificationDomainError
      && error.code === "VALIDATION_ERROR",
  );
  const events = parsePushReceiptEvents(
    new TextEncoder().encode(JSON.stringify({
      events: [{
        eventId: "event-1",
        occurredAt: "2026-07-26T00:00:00.000Z",
        providerMessageId: "message-1",
        safeCode: "DELIVERED",
        status: "DELIVERED",
      }],
      provider: "FCM",
    })),
    "FCM",
  );
  assert.equal(events.length, 1);
  assert.throws(
    () => parsePushReceiptEvents(
      new TextEncoder().encode(JSON.stringify({
        events: [],
        provider: "APNS",
      })),
      "FCM",
    ),
    (error) => error instanceof PushNotificationDomainError,
  );
});

test("Gate 7D provider configuration is exact and staging cannot select production APNs", () => {
  assert.equal(nativePushProviderConfigurationTruth("APNS", { NODE_ENV: "test" }), "NOT_CONFIGURED");
  assert.equal(nativePushProviderConfigurationTruth("FCM", { NODE_ENV: "test" }), "NOT_CONFIGURED");
  assert.equal(nativePushProviderConfigurationTruth("APNS", {
    NODE_ENV: "test",
    REZNO_APNS_BUNDLE_ID: "com.rezno.mobile",
    REZNO_APNS_ENVIRONMENT: "sandbox",
    REZNO_APNS_KEY_ID: "ABCDEFGHIJ",
    REZNO_APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
    REZNO_APNS_TEAM_ID: "1234567890",
    REZNO_ENV: "staging",
    REZNO_PUSH_ENVIRONMENT: "staging",
  }), "CONFIGURED");
  assert.equal(nativePushProviderConfigurationTruth("APNS", {
    NODE_ENV: "test",
    REZNO_APNS_BUNDLE_ID: "com.rezno.mobile",
    REZNO_APNS_ENVIRONMENT: "production",
    REZNO_APNS_KEY_ID: "ABCDEFGHIJ",
    REZNO_APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
    REZNO_APNS_TEAM_ID: "1234567890",
    REZNO_ENV: "staging",
    REZNO_PUSH_ENVIRONMENT: "staging",
  }), "NOT_CONFIGURED");
});

test("Gate 7D native config, documentation, and source keep external truth explicit", async () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const [appConfigRaw, packageRaw, source, canonical, evidence] = await Promise.all([
    readFile(path.join(root, "apps/mobile/app.json"), "utf8"),
    readFile(path.join(root, "apps/mobile/package.json"), "utf8"),
    Promise.all([
      "features/push-notifications/providers/native.ts",
      "features/push-notifications/services/installations.ts",
      "features/push-notifications/services/receipts.ts",
      "apps/mobile/src/notifications/device-registration-runtime.ts",
    ].map((file) => readFile(path.join(root, file), "utf8"))).then((files) => files.join("\n")),
    readFile(path.join(root, "docs/stage7/stage7-canonical-scope.md"), "utf8"),
    readFile(path.join(root, "docs/stage7/gate7d-device-evidence.md"), "utf8"),
  ]);
  const appConfig = JSON.parse(appConfigRaw);
  const mobilePackage = JSON.parse(packageRaw);
  assert.equal(mobilePackage.dependencies["expo-notifications"], "~57.0.8");
  assert.deepEqual(
    appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-notifications",
    ),
    ["expo-notifications", { defaultChannel: "rezno-account", sounds: [] }],
  );
  assert.doesNotMatch(
    source,
    /console\.(?:debug|info|log|warn)|authorization.*console|token.*console/iu,
  );
  assert.match(canonical, /EXTERNAL VALIDATION REQUIRED/u);
  assert.match(evidence, /NOT RUN/u);
  assert.match(evidence, /must not include push tokens/iu);
});
