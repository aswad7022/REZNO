import "server-only";

import {
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";

import { paymentError } from "@/features/payments/domain/errors";

const VERSION = 1;
const MAC_BYTES = 32;
const MAXIMUM_STATE_LENGTH = 2_048;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNING_INFO = "rezno:payments:hosted-return-state:v1";

type HostedReturnStateCore = {
  attemptId: string;
  expiresAt: number;
  handoffId: string;
  intentId: string;
  nonce: string;
  version: typeof VERSION;
};

let testSecret: string | null | undefined;

export function setHostedReturnSigningSecretForTests(
  secret: string | null | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Hosted payment return signing test configuration is unavailable.",
    );
  }
  testSecret = secret;
}

export function encodeHostedReturnState(
  input: Omit<HostedReturnStateCore, "version"> & { personId: string },
) {
  const core = validateCore({ ...input, version: VERSION });
  const canonicalInput = canonical(core, input.personId);
  const mac = createHmac("sha256", signingKey())
    .update(canonicalInput, "utf8")
    .digest("hex");
  return Buffer.from(JSON.stringify({ ...core, mac }), "utf8").toString(
    "base64url",
  );
}

export function decodeHostedReturnState(
  encoded: string,
  expected: {
    intentId: string;
    now: Date;
    personId: string;
  },
) {
  if (
    !encoded
    || encoded.length > MAXIMUM_STATE_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    invalidState();
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
  } catch {
    invalidState();
  }
  if (!isEnvelope(envelope)) invalidState();
  const { mac, ...untrustedCore } = envelope;
  const core = validateCore(untrustedCore);
  let expectedMac: Buffer;
  try {
    expectedMac = createHmac("sha256", signingKey())
      .update(canonical(core, expected.personId), "utf8")
      .digest();
  } catch {
    invalidState();
  }
  const receivedMac = Buffer.from(mac, "hex");
  if (
    receivedMac.length !== MAC_BYTES
    || expectedMac.length !== MAC_BYTES
    || !timingSafeEqual(receivedMac, expectedMac)
    || core.intentId !== expected.intentId
  ) {
    invalidState();
  }
  if (core.expiresAt <= Math.floor(expected.now.getTime() / 1_000)) {
    paymentError(
      "PAYMENT_STATE_CONFLICT",
      "Hosted payment return state expired.",
    );
  }
  return core;
}

function canonical(core: HostedReturnStateCore, personId: string) {
  return JSON.stringify({
    attemptId: core.attemptId,
    expiresAt: core.expiresAt,
    handoffId: core.handoffId,
    intentId: core.intentId,
    nonce: core.nonce,
    personId,
    version: core.version,
  });
}

function isEnvelope(
  value: unknown,
): value is HostedReturnStateCore & { mac: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const expectedKeys = [
    "attemptId",
    "expiresAt",
    "handoffId",
    "intentId",
    "mac",
    "nonce",
    "version",
  ].sort();
  const keys = Object.keys(item).sort();
  return (
    keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && typeof item.mac === "string"
    && /^[a-f0-9]{64}$/.test(item.mac)
  );
}

function validateCore(
  value: Omit<HostedReturnStateCore, "version"> & {
    personId?: string;
    version: number;
  },
): HostedReturnStateCore {
  if (
    value.version !== VERSION
    || !UUID.test(value.attemptId)
    || !UUID.test(value.handoffId)
    || !UUID.test(value.intentId)
    || !UUID.test(value.nonce)
    || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= 0
  ) {
    invalidState();
  }
  return {
    attemptId: value.attemptId.toLowerCase(),
    expiresAt: value.expiresAt,
    handoffId: value.handoffId.toLowerCase(),
    intentId: value.intentId.toLowerCase(),
    nonce: value.nonce.toLowerCase(),
    version: VERSION,
  };
}

function signingKey() {
  const secret =
    testSecret === undefined
      ? process.env.BETTER_AUTH_SECRET
      : testSecret ?? undefined;
  if (
    !secret
    || secret !== secret.trim()
    || secret.length < 32
    || secret.length * Math.log2(new Set(secret).size) < 120
  ) {
    throw new Error("Hosted payment return signing is unavailable.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.alloc(0),
      Buffer.from(SIGNING_INFO, "utf8"),
      MAC_BYTES,
    ),
  );
}

function invalidState(): never {
  paymentError("VALIDATION_ERROR", "Hosted payment return state is invalid.");
}
