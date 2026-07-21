import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const PAYMENT_CURSOR_SIGNING_INFO = {
  INTENT: "rezno:payments:intent-cursor-signing:v1",
  REFUND: "rezno:payments:refund-cursor-signing:v1",
  JOURNAL: "rezno:payments:ledger-cursor-signing:v1",
  SETTLEMENT: "rezno:payments:settlement-cursor-signing:v1",
} as const;

export type PaymentCursorKind = keyof typeof PAYMENT_CURSOR_SIGNING_INFO;
const MAC_BYTES = 32;
let testSecret: string | null | undefined;

export function setPaymentCursorSigningSecretForTests(secret: string | null | undefined): void {
  if (process.env.NODE_ENV === "production") throw new Error("Payment cursor test configuration is unavailable.");
  testSecret = secret;
}

export function signPaymentCursor(kind: PaymentCursorKind, input: string): Buffer {
  return createHmac("sha256", signingKey(kind)).update(input, "utf8").digest();
}

export function verifyPaymentCursor(kind: PaymentCursorKind, input: string, mac: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(mac)) return false;
  const received = Buffer.from(mac, "hex");
  const expected = signPaymentCursor(kind, input);
  return received.length === MAC_BYTES && expected.length === MAC_BYTES && timingSafeEqual(received, expected);
}

function signingKey(kind: PaymentCursorKind): Buffer {
  const secret = testSecret === undefined ? process.env.BETTER_AUTH_SECRET : testSecret ?? undefined;
  if (!secret || secret !== secret.trim() || secret.length < 32 || secret.length * Math.log2(new Set(secret).size) < 120) {
    throw new Error("Payment cursor signing is unavailable.");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.alloc(0),
    Buffer.from(PAYMENT_CURSOR_SIGNING_INFO[kind], "utf8"),
    MAC_BYTES,
  ));
}
