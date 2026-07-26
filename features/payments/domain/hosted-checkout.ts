import "server-only";

import type { PaymentProviderKind } from "@prisma/client";

import { paymentError } from "@/features/payments/domain/errors";

export type HostedCheckoutPolicy = {
  approvedOrigins: readonly string[];
  checkoutBaseUrl: string;
  provider: PaymentProviderKind;
};

export const APPROVED_HOSTED_CHECKOUT_ORIGINS: Readonly<
  Record<PaymentProviderKind, readonly string[]>
> = {
  DETERMINISTIC_TEST: [],
  NOT_CONFIGURED: [],
};

let testPolicy: HostedCheckoutPolicy | null | undefined;

export function setHostedCheckoutPolicyForTests(
  policy: HostedCheckoutPolicy | null | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Hosted payment checkout test configuration is unavailable.",
    );
  }
  testPolicy = policy;
}

export function configuredHostedCheckoutPolicy(
  provider: PaymentProviderKind,
): HostedCheckoutPolicy {
  if (process.env.NODE_ENV !== "production" && testPolicy) {
    if (testPolicy.provider !== provider) unavailable();
    validatePolicy(testPolicy);
    return testPolicy;
  }
  const approvedOrigins = APPROVED_HOSTED_CHECKOUT_ORIGINS[provider];
  if (!approvedOrigins.length) unavailable();
  // No provider checkout base URL is approved in source control yet. Adding
  // one requires a reviewed provider adapter and matching mobile allowlist.
  unavailable();
}

export function buildHostedCheckoutUrl(input: {
  actionReference: string;
  policy: HostedCheckoutPolicy;
  returnUrls: {
    cancel: string;
    failure: string;
    success: string;
  };
  state: string;
}) {
  validatePolicy(input.policy);
  if (
    !/^[A-Za-z0-9._~-]{1,240}$/.test(input.actionReference)
    || input.state.length < 32
    || input.state.length > 2_048
  ) {
    paymentError(
      "PAYMENT_PROVIDER_FAILURE",
      "Hosted payment action is invalid.",
    );
  }
  for (const returnUrl of Object.values(input.returnUrls)) {
    const parsed = new URL(returnUrl);
    if (
      parsed.protocol !== "rezno:"
      || parsed.hostname !== "payments"
      || parsed.pathname !== "/return"
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.hash
    ) {
      paymentError(
        "PAYMENT_PROVIDER_FAILURE",
        "Hosted payment return URL is invalid.",
      );
    }
  }
  const checkout = new URL(input.policy.checkoutBaseUrl);
  checkout.searchParams.set("reference", input.actionReference);
  checkout.searchParams.set("state", input.state);
  checkout.searchParams.set("success_url", input.returnUrls.success);
  checkout.searchParams.set("cancel_url", input.returnUrls.cancel);
  checkout.searchParams.set("failure_url", input.returnUrls.failure);
  return checkout.toString();
}

export function hostedPaymentReturnUrls(intentId: string, state: string) {
  return {
    cancel: returnUrl(intentId, state, "cancel"),
    failure: returnUrl(intentId, state, "failure"),
    success: returnUrl(intentId, state, "success"),
  };
}

function returnUrl(
  intentId: string,
  state: string,
  outcome: "cancel" | "failure" | "success",
) {
  const url = new URL("rezno://payments/return");
  url.searchParams.set("intentId", intentId);
  url.searchParams.set("outcome", outcome);
  url.searchParams.set("state", state);
  return url.toString();
}

function validatePolicy(policy: HostedCheckoutPolicy) {
  const normalizedOrigins = policy.approvedOrigins.map((value) =>
    exactHttpsOrigin(value),
  );
  if (
    normalizedOrigins.length === 0
    || new Set(normalizedOrigins).size !== normalizedOrigins.length
  ) {
    unavailable();
  }
  const checkout = new URL(policy.checkoutBaseUrl);
  if (
    checkout.protocol !== "https:"
    || checkout.origin !== exactHttpsOrigin(checkout.origin)
    || !normalizedOrigins.includes(checkout.origin)
    || checkout.username
    || checkout.password
    || checkout.port
    || checkout.hash
    || checkout.search
    || checkout.pathname === "/"
    || checkout.pathname.endsWith("/")
  ) {
    unavailable();
  }
}

function exactHttpsOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    unavailable();
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.pathname !== "/"
    || url.search
    || url.hash
    || url.origin !== value
  ) {
    unavailable();
  }
  return url.origin;
}

function unavailable(): never {
  paymentError(
    "PAYMENT_PROVIDER_NOT_CONFIGURED",
    "Hosted payment checkout is not configured.",
  );
}
