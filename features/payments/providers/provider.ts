import type { PaymentProviderKind } from "@prisma/client";

export type ProviderOutcome =
  | "READY"
  | "REQUIRES_ACTION"
  | "AUTHORIZED"
  | "CAPTURED"
  | "NOT_FOUND"
  | "NOT_CONFIGURED"
  | "TRANSIENT_FAILURE"
  | "PERMANENT_FAILURE"
  | "INVALID_SIGNATURE"
  | "DUPLICATE";

export interface ProviderResult {
  outcome: ProviderOutcome;
  providerReference?: string;
  safeCode?: string;
  actionReference?: string;
  actionExpiresAt?: Date;
}

export interface SafeCreatePaymentInput {
  amount: string;
  currency: "IQD";
  expiresAt: Date;
  paymentIntentId: string;
  providerRequestReference: string;
}

export interface SafePaymentReference {
  paymentIntentId: string;
  providerReference: string;
}

export interface SafeCaptureInput extends SafePaymentReference {
  amount: string;
  currency: "IQD";
  providerRequestReference: string;
}

export interface SafeCancelInput extends SafePaymentReference {
  providerRequestReference: string;
}

export interface SafeRefundInput extends SafePaymentReference {
  amount: string;
  currency: "IQD";
  providerRequestReference: string;
  refundId: string;
}

export interface SafeWebhookInput {
  body: Uint8Array;
  signature: string | null;
  timestamp: string | null;
  receivedAt: Date;
}

export interface NormalizedWebhookEvent {
  amount: string | null;
  currency: "IQD" | null;
  eventId: string;
  occurredAt: Date;
  outcome: ProviderOutcome;
  providerReference: string;
  safeCode: string | null;
}

export type WebhookParseResult =
  | { outcome: "INVALID_SIGNATURE" }
  | { outcome: "READY"; event: NormalizedWebhookEvent };

export interface PaymentProvider {
  readonly kind: PaymentProviderKind;
  readonly displayName: string;
  createPayment(input: SafeCreatePaymentInput): Promise<ProviderResult>;
  inspectPayment(input: SafePaymentReference): Promise<ProviderResult>;
  capturePayment(input: SafeCaptureInput): Promise<ProviderResult>;
  cancelPayment(input: SafeCancelInput): Promise<ProviderResult>;
  refundPayment(input: SafeRefundInput): Promise<ProviderResult>;
  verifyAndParseWebhook(input: SafeWebhookInput): Promise<WebhookParseResult>;
}

export class NotConfiguredPaymentProvider implements PaymentProvider {
  readonly kind = "NOT_CONFIGURED" as const;
  readonly displayName = "Online payment";

  async createPayment(): Promise<ProviderResult> { return { outcome: "NOT_CONFIGURED" }; }
  async inspectPayment(): Promise<ProviderResult> { return { outcome: "NOT_CONFIGURED" }; }
  async capturePayment(): Promise<ProviderResult> { return { outcome: "NOT_CONFIGURED" }; }
  async cancelPayment(): Promise<ProviderResult> { return { outcome: "NOT_CONFIGURED" }; }
  async refundPayment(): Promise<ProviderResult> { return { outcome: "NOT_CONFIGURED" }; }
  async verifyAndParseWebhook(): Promise<WebhookParseResult> { return { outcome: "INVALID_SIGNATURE" }; }
}
