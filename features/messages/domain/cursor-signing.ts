import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const MESSAGE_CURSOR_SIGNING_INFO =
  "rezno:messages:cursor-signing:v3";
export const MESSAGE_CURSOR_MAC_BYTES = 32;

const MINIMUM_AUTH_SECRET_LENGTH = 32;
const MINIMUM_AUTH_SECRET_ENTROPY_BITS = 120;
const FORBIDDEN_AUTH_SECRETS = new Set([
  "better-auth-secret-12345678901234567890",
  "replace-with-at-least-32-random-characters",
]);

let testSigningSecret: string | null | undefined;

export function setMessageCursorSigningSecretForTests(
  secret: string | null | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Message cursor signing test configuration is unavailable.");
  }
  testSigningSecret = secret;
}

export function signMessageCursor(canonicalInput: string): Buffer {
  return createHmac("sha256", resolveSigningKey())
    .update(canonicalInput, "utf8")
    .digest();
}

export function verifyMessageCursorMac(
  canonicalInput: string,
  receivedMac: string,
) {
  if (!/^[a-f0-9]{64}$/.test(receivedMac)) return false;
  const received = Buffer.from(receivedMac, "hex");
  const expected = signMessageCursor(canonicalInput);
  if (
    received.length !== MESSAGE_CURSOR_MAC_BYTES
    || expected.length !== MESSAGE_CURSOR_MAC_BYTES
    || received.length !== expected.length
  ) return false;
  return timingSafeEqual(received, expected);
}

function resolveSigningKey() {
  const secret = testSigningSecret === undefined
    ? process.env.BETTER_AUTH_SECRET
    : testSigningSecret ?? undefined;
  if (!validAuthSecret(secret)) {
    throw new Error("Message cursor signing is unavailable.");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from(MESSAGE_CURSOR_SIGNING_INFO, "utf8"),
    MESSAGE_CURSOR_MAC_BYTES,
  ));
}

function validAuthSecret(secret: string | undefined): secret is string {
  if (!secret || secret !== secret.trim()) return false;
  if (secret.length < MINIMUM_AUTH_SECRET_LENGTH) return false;
  if (FORBIDDEN_AUTH_SECRETS.has(secret)) return false;
  return secret.length * Math.log2(new Set(secret).size)
    >= MINIMUM_AUTH_SECRET_ENTROPY_BITS;
}
