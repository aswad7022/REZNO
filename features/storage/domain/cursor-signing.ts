import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const STORAGE_ASSET_CURSOR_SIGNING_INFO = "rezno:storage:asset-cursor-signing:v1";
export const STORAGE_SESSION_CURSOR_SIGNING_INFO = "rezno:storage:session-cursor-signing:v1";
const MAC_BYTES = 32;
const MINIMUM_SECRET_LENGTH = 32;
let testSecret: string | null | undefined;

export function setStorageCursorSigningSecretForTests(secret: string | null | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Storage cursor signing test configuration is unavailable.");
  }
  testSecret = secret;
}

export function signStorageCursor(kind: "ASSET" | "SESSION", input: string) {
  return createHmac("sha256", signingKey(kind)).update(input, "utf8").digest();
}

export function verifyStorageCursor(kind: "ASSET" | "SESSION", input: string, mac: string) {
  if (!/^[a-f0-9]{64}$/.test(mac)) return false;
  const received = Buffer.from(mac, "hex");
  const expected = signStorageCursor(kind, input);
  return received.length === MAC_BYTES
    && expected.length === MAC_BYTES
    && timingSafeEqual(received, expected);
}

function signingKey(kind: "ASSET" | "SESSION") {
  const secret = testSecret === undefined ? process.env.BETTER_AUTH_SECRET : testSecret ?? undefined;
  if (!validSecret(secret)) throw new Error("Storage cursor signing is unavailable.");
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from(kind === "ASSET" ? STORAGE_ASSET_CURSOR_SIGNING_INFO : STORAGE_SESSION_CURSOR_SIGNING_INFO),
    MAC_BYTES,
  ));
}

function validSecret(secret: string | undefined): secret is string {
  if (!secret || secret !== secret.trim() || secret.length < MINIMUM_SECRET_LENGTH) return false;
  return secret.length * Math.log2(new Set(secret).size) >= 120;
}
