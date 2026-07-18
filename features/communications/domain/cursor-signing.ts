import "server-only";

import {
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";

export const COMMUNICATION_CURSOR_SIGNING_INFO =
  "rezno:communications:cursor-signing:v2";
export const COMMUNICATION_CURSOR_MAC_BYTES = 32;

const MINIMUM_AUTH_SECRET_LENGTH = 32;
const MINIMUM_AUTH_SECRET_ENTROPY_BITS = 120;
const FORBIDDEN_AUTH_SECRETS = new Set([
  "better-auth-secret-12345678901234567890",
  "replace-with-at-least-32-random-characters",
]);

let testSigningSecret: string | null | undefined;

export function setCommunicationCursorSigningSecretForTests(
  secret: string | null | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Communication cursor signing test configuration is unavailable.");
  }
  testSigningSecret = secret;
}

export function signCommunicationCursor(canonicalInput: string): Buffer {
  return createHmac("sha256", resolveCommunicationCursorSigningKey())
    .update(canonicalInput, "utf8")
    .digest();
}

export function verifyCommunicationCursorMac(
  canonicalInput: string,
  receivedMac: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(receivedMac)) return false;
  const received = Buffer.from(receivedMac, "hex");
  const expected = signCommunicationCursor(canonicalInput);
  if (
    received.length !== COMMUNICATION_CURSOR_MAC_BYTES
    || expected.length !== COMMUNICATION_CURSOR_MAC_BYTES
    || received.length !== expected.length
  ) return false;
  return timingSafeEqual(received, expected);
}

function resolveCommunicationCursorSigningKey(): Buffer {
  const secret = testSigningSecret === undefined
    ? process.env.BETTER_AUTH_SECRET
    : testSigningSecret ?? undefined;
  if (!validAuthSecret(secret)) {
    throw new Error("Communication cursor signing is unavailable.");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from(COMMUNICATION_CURSOR_SIGNING_INFO, "utf8"),
    COMMUNICATION_CURSOR_MAC_BYTES,
  ));
}

function validAuthSecret(secret: string | undefined): secret is string {
  if (!secret || secret !== secret.trim()) return false;
  if (secret.length < MINIMUM_AUTH_SECRET_LENGTH) return false;
  if (FORBIDDEN_AUTH_SECRETS.has(secret)) return false;
  return secret.length * Math.log2(new Set(secret).size)
    >= MINIMUM_AUTH_SECRET_ENTROPY_BITS;
}
