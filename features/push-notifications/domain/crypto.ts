import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { pushNotificationError } from "@/features/push-notifications/domain/errors";

const TOKEN_KEY_BYTES = 32;

export function pushSecretHash(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function pushTokenFingerprint(provider: string, token: string) {
  return createHash("sha256")
    .update(`rezno-push-token:v1:${provider}:${token}`, "utf8")
    .digest("hex");
}

export function deletePushTokenMaterial(input: {
  installationId: string;
  provider: string;
}) {
  const nonce = randomBytes(32).toString("base64url");
  return {
    tokenCiphertext: `deleted.v1.${nonce}`,
    tokenFingerprint: createHash("sha256")
      .update(
        `rezno-push-token-deleted:v1:${input.installationId}:${input.provider}:${nonce}`,
        "utf8",
      )
      .digest("hex"),
  };
}

export function pushRequestHash(value: unknown) {
  return createHash("sha256")
    .update(stableJson(value), "utf8")
    .digest("hex");
}

export function encryptPushToken(input: {
  installationId: string;
  provider: string;
  token: string;
}, environment: NodeJS.ProcessEnv = process.env) {
  const key = readTokenEncryptionKey(environment);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(pushTokenAad(input.installationId, input.provider));
  const ciphertext = Buffer.concat([
    cipher.update(input.token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    nonce.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPushToken(input: {
  ciphertext: string;
  installationId: string;
  provider: string;
}, environment: NodeJS.ProcessEnv = process.env) {
  const parts = input.ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    pushNotificationError(
      "SERVICE_UNAVAILABLE",
      "The push token could not be decrypted.",
    );
  }
  try {
    const key = readTokenEncryptionKey(environment);
    const nonce = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error("invalid ciphertext");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(pushTokenAad(input.installationId, input.provider));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    pushNotificationError(
      "SERVICE_UNAVAILABLE",
      "The push token could not be decrypted.",
    );
  }
}

export function verifyPushReceiptSignature(input: {
  body: Uint8Array;
  signature: string;
  timestamp: string;
}, environment: NodeJS.ProcessEnv = process.env) {
  const secret = environment.REZNO_PUSH_RECEIPT_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) return false;
  const match = /^v1=([0-9a-f]{64})$/.exec(input.signature);
  if (!match) return false;
  const expected = createHmac("sha256", secret)
    .update(input.timestamp, "utf8")
    .update(".")
    .update(input.body)
    .digest();
  const actual = Buffer.from(match[1], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readTokenEncryptionKey(environment: NodeJS.ProcessEnv) {
  const raw = environment.REZNO_PUSH_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    pushNotificationError(
      "SERVICE_UNAVAILABLE",
      "Push token storage is not configured.",
    );
  }
  try {
    const key = Buffer.from(raw, "base64");
    if (key.length !== TOKEN_KEY_BYTES) throw new Error("invalid key");
    return key;
  } catch {
    pushNotificationError(
      "SERVICE_UNAVAILABLE",
      "Push token storage is not configured.",
    );
  }
}

function pushTokenAad(installationId: string, provider: string) {
  return Buffer.from(
    `rezno-push-token:v1:${installationId}:${provider}`,
    "utf8",
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
