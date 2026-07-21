import "server-only";

import type { PaymentProviderKind } from "@prisma/client";

import { PaymentDomainError } from "@/features/payments/domain/errors";
import { assertPaymentWebhookProviderConfigured } from "@/features/payments/providers/registry";
import {
  configuredTrustedProxyHeader,
  consumeRateLimit,
  getRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit-core";

const PAYMENT_WEBHOOK_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
type PaymentWebhookRateLimitConsumer = typeof consumeRateLimit;
let paymentWebhookRateLimitConsumer: PaymentWebhookRateLimitConsumer = consumeRateLimit;

export function assertPaymentWebhookRequestAllowed(
  request: Request,
  scope: string,
  provider: PaymentProviderKind,
): void {
  const derivedIdentifier = getRateLimitIdentifierFromHeaders(
    request.headers,
    `payment-webhook:${provider.toLowerCase()}`,
    { trustedProxyHeader: configuredTrustedProxyHeader() },
  );
  const identifier = derivedIdentifier.startsWith("ephemeral:") ? "unidentified" : derivedIdentifier;
  const rate = paymentWebhookRateLimitConsumer(
    `payments.${scope}.${provider.toLowerCase()}`,
    identifier,
    PAYMENT_WEBHOOK_RATE_LIMIT,
  );
  if (!rate.success) {
    throw new PaymentDomainError("RATE_LIMITED", "Too many payment webhook requests.", {
      retryAfterSeconds: Math.min(60, Math.max(1, rate.retryAfterSeconds)),
    });
  }
  assertPaymentWebhookProviderConfigured(provider);
}

export function setPaymentWebhookRateLimitConsumerForTests(
  consumer?: PaymentWebhookRateLimitConsumer,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Payment webhook rate-limit test configuration is unavailable in production.");
  }
  paymentWebhookRateLimitConsumer = consumer ?? consumeRateLimit;
}
