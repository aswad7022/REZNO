import { paymentError } from "@/features/payments/domain/errors";
import type { PaymentProviderKind } from "@prisma/client";

import { NotConfiguredPaymentProvider, type PaymentProvider } from "./provider";

let testProvider: PaymentProvider | null = null;
const notConfigured = new NotConfiguredPaymentProvider();

export function setPaymentProviderForTests(provider: PaymentProvider | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Payment provider test configuration is unavailable in production.");
  }
  testProvider = provider;
}

export function paymentProvider(): PaymentProvider {
  if (process.env.NODE_ENV === "production") return notConfigured;
  if (testProvider?.kind === "DETERMINISTIC_TEST") return testProvider;
  return notConfigured;
}

export function configuredPaymentProvider(): PaymentProvider {
  const provider = paymentProvider();
  if (provider.kind === "NOT_CONFIGURED") {
    paymentError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Online payment provider is not configured.");
  }
  return provider;
}

export function assertPaymentWebhookProviderConfigured(expectedProvider: PaymentProviderKind): void {
  const provider = paymentProvider();
  if (provider.kind === "NOT_CONFIGURED" || provider.kind !== expectedProvider) {
    paymentError("PAYMENT_PROVIDER_NOT_CONFIGURED", "Online payment provider is not configured.");
  }
}
