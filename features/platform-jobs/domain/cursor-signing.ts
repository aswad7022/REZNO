import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

const INFO = "rezno:platform-jobs:cursor-signing:v1";
const MAC_BYTES = 32;
let testSecret: string | null | undefined;

export function setPlatformJobCursorSigningSecretForTests(secret: string | null | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Platform job cursor test configuration is unavailable.");
  }
  testSecret = secret;
}

export function signPlatformJobCursor(input: string) {
  return createHmac("sha256", signingKey()).update(input, "utf8").digest();
}

export function verifyPlatformJobCursor(input: string, mac: string) {
  if (!/^[a-f0-9]{64}$/.test(mac)) return false;
  const received = Buffer.from(mac, "hex");
  const expected = signPlatformJobCursor(input);
  return received.length === MAC_BYTES && timingSafeEqual(received, expected);
}

function signingKey() {
  const secret = testSecret === undefined ? process.env.BETTER_AUTH_SECRET : testSecret ?? undefined;
  if (!secret || secret !== secret.trim() || secret.length < 32 || secret.length * Math.log2(new Set(secret).size) < 120) {
    throw new Error("Platform job cursor signing is unavailable.");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from(INFO, "utf8"),
    MAC_BYTES,
  ));
}
