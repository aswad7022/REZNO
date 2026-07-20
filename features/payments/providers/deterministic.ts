import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  NormalizedWebhookEvent,
  PaymentProvider,
  ProviderOutcome,
  ProviderResult,
  SafeCancelInput,
  SafeCaptureInput,
  SafeCreatePaymentInput,
  SafePaymentReference,
  SafeRefundInput,
  SafeWebhookInput,
  WebhookParseResult,
} from "./provider";

export type DeterministicScenario =
  | "IMMEDIATE_CAPTURE"
  | "REQUIRES_ACTION"
  | "AUTHORIZE"
  | "TRANSIENT_FAILURE"
  | "PERMANENT_FAILURE";

interface DeterministicRecord {
  actionExpiresAt?: Date;
  actionReference?: string;
  amount: string;
  currency: "IQD";
  outcome: ProviderOutcome;
  providerReference: string;
  refunded: string;
  safeCode?: string;
}

const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export class DeterministicPaymentProvider implements PaymentProvider {
  readonly kind = "DETERMINISTIC_TEST" as const;
  readonly displayName = "Deterministic payment";
  private readonly scenarios = new Map<string, DeterministicScenario>();
  private readonly records = new Map<string, DeterministicRecord>();
  private readonly requestResults = new Map<string, ProviderResult>();
  private defaultScenario: DeterministicScenario = "IMMEDIATE_CAPTURE";

  constructor(private readonly webhookSecret: string, private readonly now: () => Date = () => new Date()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Deterministic payment provider cannot run in production.");
    }
    if (webhookSecret.length < 16) throw new Error("Deterministic webhook test secret is too short.");
  }

  configureRequest(providerRequestReference: string, scenario: DeterministicScenario): void {
    this.scenarios.set(providerRequestReference, scenario);
  }

  configureDefaultScenario(scenario: DeterministicScenario): void {
    this.defaultScenario = scenario;
  }

  async createPayment(input: SafeCreatePaymentInput): Promise<ProviderResult> {
    const replay = this.requestResults.get(input.providerRequestReference);
    if (replay) return { ...replay, outcome: "DUPLICATE" };
    const scenario = this.scenarios.get(input.providerRequestReference) ?? this.defaultScenario;
    const providerReference = "det_" + createHash("sha256").update(input.paymentIntentId).digest("hex").slice(0, 32);
    let result: ProviderResult;
    if (scenario === "TRANSIENT_FAILURE") result = { outcome: "TRANSIENT_FAILURE", safeCode: "TEMPORARY_UNAVAILABLE" };
    else if (scenario === "PERMANENT_FAILURE") result = { outcome: "PERMANENT_FAILURE", safeCode: "PAYMENT_DECLINED" };
    else if (scenario === "REQUIRES_ACTION") {
      result = {
        actionExpiresAt: new Date(this.now().getTime() + 10 * 60 * 1000),
        actionReference: "action_" + createHash("sha256").update(input.providerRequestReference).digest("hex").slice(0, 24),
        outcome: "REQUIRES_ACTION",
        providerReference,
      };
    } else if (scenario === "AUTHORIZE") result = { outcome: "AUTHORIZED", providerReference };
    else result = { outcome: "CAPTURED", providerReference };
    this.requestResults.set(input.providerRequestReference, result);
    if (result.providerReference) {
      this.records.set(result.providerReference, {
        actionExpiresAt: result.actionExpiresAt,
        actionReference: result.actionReference,
        amount: input.amount,
        currency: input.currency,
        outcome: result.outcome,
        providerReference,
        refunded: "0.000",
        safeCode: result.safeCode,
      });
    }
    return result;
  }

  async inspectPayment(input: SafePaymentReference): Promise<ProviderResult> {
    const record = this.records.get(input.providerReference);
    return record
      ? {
          actionExpiresAt: record.actionExpiresAt,
          actionReference: record.actionReference,
          outcome: record.outcome,
          providerReference: record.providerReference,
          safeCode: record.safeCode,
        }
      : { outcome: "NOT_FOUND" };
  }

  async capturePayment(input: SafeCaptureInput): Promise<ProviderResult> {
    const replay = this.requestResults.get(input.providerRequestReference);
    if (replay) return { ...replay, outcome: "DUPLICATE" };
    const record = this.records.get(input.providerReference);
    const result: ProviderResult = !record
      ? { outcome: "NOT_FOUND" }
      : record.outcome === "CAPTURED"
        ? { outcome: "DUPLICATE", providerReference: record.providerReference }
        : { outcome: "CAPTURED", providerReference: record.providerReference };
    if (record && result.outcome === "CAPTURED") record.outcome = "CAPTURED";
    this.requestResults.set(input.providerRequestReference, result);
    return result;
  }

  async cancelPayment(input: SafeCancelInput): Promise<ProviderResult> {
    const replay = this.requestResults.get(input.providerRequestReference);
    if (replay) return { ...replay, outcome: "DUPLICATE" };
    const record = this.records.get(input.providerReference);
    const result: ProviderResult = !record
      ? { outcome: "NOT_FOUND" }
      : record.outcome === "CAPTURED"
        ? { outcome: "PERMANENT_FAILURE", safeCode: "ALREADY_CAPTURED" }
        : { outcome: "READY", providerReference: record.providerReference };
    if (record && result.outcome === "READY") record.outcome = "READY";
    this.requestResults.set(input.providerRequestReference, result);
    return result;
  }

  async refundPayment(input: SafeRefundInput): Promise<ProviderResult> {
    const replay = this.requestResults.get(input.providerRequestReference);
    if (replay) return { ...replay, outcome: "DUPLICATE" };
    const scenario = this.scenarios.get(input.providerRequestReference);
    const record = this.records.get(input.providerReference);
    let result: ProviderResult;
    if (scenario === "TRANSIENT_FAILURE") result = { outcome: "TRANSIENT_FAILURE", safeCode: "TEMPORARY_UNAVAILABLE" };
    else if (scenario === "PERMANENT_FAILURE") result = { outcome: "PERMANENT_FAILURE", safeCode: "REFUND_DECLINED" };
    else if (!record || record.outcome !== "CAPTURED") result = { outcome: "NOT_FOUND" };
    else {
      record.refunded = input.amount;
      result = {
        outcome: "READY",
        providerReference: "refund_" + createHash("sha256").update(input.refundId).digest("hex").slice(0, 32),
      };
    }
    this.requestResults.set(input.providerRequestReference, result);
    return result;
  }

  signWebhook(event: NormalizedWebhookEvent, timestamp = this.now()): { body: Uint8Array; signature: string; timestamp: string } {
    const timestampValue = String(Math.floor(timestamp.getTime() / 1000));
    const body = Buffer.from(JSON.stringify({
      amount: event.amount,
      currency: event.currency,
      eventId: event.eventId,
      occurredAt: event.occurredAt.toISOString(),
      outcome: event.outcome,
      providerReference: event.providerReference,
      safeCode: event.safeCode,
    }));
    return {
      body,
      signature: createHmac("sha256", this.webhookSecret).update(timestampValue).update(".").update(body).digest("hex"),
      timestamp: timestampValue,
    };
  }

  async verifyAndParseWebhook(input: SafeWebhookInput): Promise<WebhookParseResult> {
    if (!input.signature || !input.timestamp || input.body.byteLength === 0 || input.body.byteLength > 64 * 1024) {
      return { outcome: "INVALID_SIGNATURE" };
    }
    const epochSeconds = Number(input.timestamp);
    if (!Number.isSafeInteger(epochSeconds) || Math.abs(input.receivedAt.getTime() - epochSeconds * 1000) > WEBHOOK_TOLERANCE_MS) {
      return { outcome: "INVALID_SIGNATURE" };
    }
    const expected = createHmac("sha256", this.webhookSecret).update(input.timestamp).update(".").update(input.body).digest();
    let supplied: Buffer;
    try { supplied = Buffer.from(input.signature, "hex"); } catch { return { outcome: "INVALID_SIGNATURE" }; }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return { outcome: "INVALID_SIGNATURE" };
    try {
      const parsed = JSON.parse(Buffer.from(input.body).toString("utf8")) as Record<string, unknown>;
      const outcome = parsed.outcome;
      if (
        typeof parsed.eventId !== "string" ||
        typeof parsed.providerReference !== "string" ||
        parsed.eventId.length < 1 ||
        parsed.eventId.length > 180 ||
        parsed.providerReference.length < 1 ||
        parsed.providerReference.length > 180 ||
        typeof parsed.occurredAt !== "string" ||
        typeof outcome !== "string" ||
        !["READY", "AUTHORIZED", "CAPTURED", "TRANSIENT_FAILURE", "PERMANENT_FAILURE"].includes(outcome)
      ) return { outcome: "INVALID_SIGNATURE" };
      const occurredAt = new Date(parsed.occurredAt);
      if (!Number.isFinite(occurredAt.getTime())) return { outcome: "INVALID_SIGNATURE" };
      return {
        event: {
          amount: typeof parsed.amount === "string" ? parsed.amount : null,
          currency: parsed.currency === "IQD" ? "IQD" : null,
          eventId: parsed.eventId,
          occurredAt,
          outcome: outcome as ProviderOutcome,
          providerReference: parsed.providerReference,
          safeCode: typeof parsed.safeCode === "string" ? parsed.safeCode.slice(0, 80) : null,
        },
        outcome: "READY",
      };
    } catch {
      return { outcome: "INVALID_SIGNATURE" };
    }
  }
}
