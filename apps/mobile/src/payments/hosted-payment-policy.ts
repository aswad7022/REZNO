import type {
  MobileHostedPaymentHandoff,
  MobilePaymentIntent,
} from "../types/payments";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_ID = /^[A-Za-z0-9._~-]{1,128}$/;
const STATE = /^[A-Za-z0-9_-]{32,2048}$/;

// No real hosted-payment provider origin has been approved. Adding an origin
// here must accompany a reviewed provider adapter and matching server policy.
export const APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS: readonly string[] = [];

export type HostedPaymentReturnOutcome = "cancel" | "failure" | "success";

export type ParsedHostedPaymentReturn = {
  intentId: string;
  outcome: HostedPaymentReturnOutcome;
  state: string;
};

export type HostedPaymentRecoveryCheckpoint =
  | "VERIFYING_STATUS"
  | "WAITING_RETURN";

export type HostedPaymentRecoveryManifest = {
  checkpoint: HostedPaymentRecoveryCheckpoint;
  checkoutUrl: string;
  createdAt: number;
  expiresAt: number;
  idempotencyKey: string;
  intentId: string;
  operationId: string;
  outcome: HostedPaymentReturnOutcome | null;
  ownerId: string;
  returnReceivedAt: number | null;
  returnUrl: string;
  state: string;
  verificationAttempts: number;
  version: 1;
};

export class HostedPaymentPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HostedPaymentPolicyError";
  }
}

export function validateHostedPaymentHandoff(
  handoff: MobileHostedPaymentHandoff,
  input: {
    approvedOrigins?: readonly string[];
    intentId: string;
    now: number;
  },
) {
  if (
    handoff.kind !== "HOSTED_PAYMENT_HANDOFF"
    || handoff.intentId !== input.intentId
    || !UUID.test(handoff.intentId)
    || !STATE.test(handoff.state)
  ) {
    invalid("INVALID_HANDOFF");
  }
  const expiresAt = Date.parse(handoff.expiresAt);
  if (
    !Number.isFinite(expiresAt)
    || expiresAt <= input.now
    || expiresAt > input.now + 5 * 60 * 1_000 + 5_000
  ) {
    invalid("EXPIRED_HANDOFF");
  }
  assertApprovedHostedCheckoutUrl(
    handoff.checkoutUrl,
    input.approvedOrigins,
  );
  for (const outcome of ["cancel", "failure", "success"] as const) {
    const parsed = parseHostedPaymentReturnUrl(handoff.returnUrls[outcome]);
    if (
      parsed.intentId !== handoff.intentId
      || parsed.outcome !== outcome
      || parsed.state !== handoff.state
    ) {
      invalid("INVALID_RETURN_URL");
    }
  }
  return handoff;
}

export function assertApprovedHostedCheckoutUrl(
  value: string,
  approvedOrigins: readonly string[] =
    APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("UNAPPROVED_CHECKOUT");
  }
  const normalizedOrigins = approvedOrigins.map(exactHttpsOrigin);
  if (
    normalizedOrigins.length === 0
    || new Set(normalizedOrigins).size !== normalizedOrigins.length
    || url.protocol !== "https:"
    || !normalizedOrigins.includes(url.origin)
    || url.username
    || url.password
    || url.port
    || url.hash
    || url.pathname === "/"
  ) {
    invalid("UNAPPROVED_CHECKOUT");
  }
  return url.toString();
}

export function parseHostedPaymentReturnUrl(
  value: string,
): ParsedHostedPaymentReturn {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("INVALID_RETURN_URL");
  }
  const keys = [...url.searchParams.keys()].sort();
  const expected = ["intentId", "outcome", "state"];
  if (
    url.protocol !== "rezno:"
    || url.hostname !== "payments"
    || url.pathname !== "/return"
    || url.username
    || url.password
    || url.port
    || url.hash
    || keys.length !== expected.length
    || !keys.every((key, index) => key === expected[index])
    || expected.some((key) => url.searchParams.getAll(key).length !== 1)
  ) {
    invalid("INVALID_RETURN_URL");
  }
  const intentId = url.searchParams.get("intentId") ?? "";
  const outcome = url.searchParams.get("outcome") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (
    !UUID.test(intentId)
    || (outcome !== "cancel"
      && outcome !== "failure"
      && outcome !== "success")
    || !STATE.test(state)
  ) {
    invalid("INVALID_RETURN_URL");
  }
  return {
    intentId: intentId.toLowerCase(),
    outcome,
    state,
  };
}

export function createHostedPaymentRecoveryManifest(input: {
  handoff: MobileHostedPaymentHandoff;
  idempotencyKey: string;
  now: number;
  operationId: string;
  ownerId: string;
}): HostedPaymentRecoveryManifest {
  if (
    !UUID.test(input.idempotencyKey)
    || !UUID.test(input.operationId)
    || !OWNER_ID.test(input.ownerId)
  ) {
    invalid("INVALID_RECOVERY");
  }
  return {
    checkpoint: "WAITING_RETURN",
    checkoutUrl: input.handoff.checkoutUrl,
    createdAt: input.now,
    expiresAt: Date.parse(input.handoff.expiresAt),
    idempotencyKey: input.idempotencyKey.toLowerCase(),
    intentId: input.handoff.intentId.toLowerCase(),
    operationId: input.operationId.toLowerCase(),
    outcome: null,
    ownerId: input.ownerId,
    returnReceivedAt: null,
    returnUrl: "rezno://payments/return",
    state: input.handoff.state,
    verificationAttempts: 0,
    version: 1,
  };
}

export function parseHostedPaymentRecoveryManifest(
  raw: string,
  input: {
    allowExpired?: boolean;
    approvedOrigins: readonly string[];
    now: number;
    ownerId: string;
  },
) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    invalid("INVALID_RECOVERY");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("INVALID_RECOVERY");
  }
  const item = value as Record<string, unknown>;
  const expectedKeys = [
    "checkpoint",
    "checkoutUrl",
    "createdAt",
    "expiresAt",
    "idempotencyKey",
    "intentId",
    "operationId",
    "outcome",
    "ownerId",
    "returnReceivedAt",
    "returnUrl",
    "state",
    "verificationAttempts",
    "version",
  ].sort();
  const keys = Object.keys(item).sort();
  if (
    keys.length !== expectedKeys.length
    || !keys.every((key, index) => key === expectedKeys[index])
    || item.version !== 1
    || (item.checkpoint !== "WAITING_RETURN"
      && item.checkpoint !== "VERIFYING_STATUS")
    || typeof item.checkoutUrl !== "string"
    || typeof item.returnUrl !== "string"
    || item.returnUrl !== "rezno://payments/return"
    || typeof item.state !== "string"
    || !STATE.test(item.state)
    || typeof item.ownerId !== "string"
    || !OWNER_ID.test(item.ownerId)
    || item.ownerId !== input.ownerId
    || typeof item.intentId !== "string"
    || !UUID.test(item.intentId)
    || typeof item.operationId !== "string"
    || !UUID.test(item.operationId)
    || typeof item.idempotencyKey !== "string"
    || !UUID.test(item.idempotencyKey)
    || !Number.isSafeInteger(item.createdAt)
    || !Number.isSafeInteger(item.expiresAt)
    || (item.createdAt as number) < 1
    || (item.outcome !== null
      && item.outcome !== "cancel"
      && item.outcome !== "failure"
      && item.outcome !== "success")
    || (item.returnReceivedAt !== null
      && !Number.isSafeInteger(item.returnReceivedAt))
    || !Number.isSafeInteger(item.verificationAttempts)
    || (item.verificationAttempts as number) < 0
    || (item.verificationAttempts as number) > 5
    || (item.createdAt as number) > input.now + 5_000
    || (item.expiresAt as number) <= (item.createdAt as number)
    || (item.expiresAt as number) > (item.createdAt as number) + 305_000
    || (
      item.checkpoint === "WAITING_RETURN"
      && (
        item.outcome !== null
        || item.returnReceivedAt !== null
        || item.verificationAttempts !== 0
      )
    )
    || (
      item.checkpoint === "VERIFYING_STATUS"
      && (
        item.outcome === null
        || item.returnReceivedAt === null
        || (item.returnReceivedAt as number) < (item.createdAt as number)
        || (item.returnReceivedAt as number) > (item.expiresAt as number)
        || (item.returnReceivedAt as number) > input.now + 5_000
      )
    )
    || (!input.allowExpired && (item.expiresAt as number) <= input.now)
  ) {
    invalid("INVALID_RECOVERY");
  }
  try {
    assertApprovedHostedCheckoutUrl(
      item.checkoutUrl as string,
      input.approvedOrigins,
    );
  } catch {
    invalid("INVALID_RECOVERY");
  }
  return item as HostedPaymentRecoveryManifest;
}

export function authoritativeHostedPaymentOutcome(
  payment: MobilePaymentIntent,
) {
  if (
    payment.status === "CAPTURED"
    || payment.status === "PARTIALLY_REFUNDED"
    || payment.status === "REFUNDED"
  ) {
    return "CONFIRMED" as const;
  }
  if (
    payment.status === "CANCELLED"
    || payment.status === "EXPIRED"
    || payment.status === "FAILED"
  ) {
    return "DECLINED" as const;
  }
  return "PENDING" as const;
}

function exactHttpsOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("UNAPPROVED_CHECKOUT");
  }
  if (
    url.protocol !== "https:"
    || url.origin !== value
    || url.pathname !== "/"
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
  ) {
    invalid("UNAPPROVED_CHECKOUT");
  }
  return url.origin;
}

function invalid(code: string): never {
  throw new HostedPaymentPolicyError(code);
}
