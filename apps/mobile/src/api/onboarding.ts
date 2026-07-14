import { mobileApiRequest } from "./client";
import { MOBILE_AUTH_FLOW_TIMEOUT_MS } from "../config/api";

type CustomerOnboardingResponse = {
  data: { isOnboarded: true };
};

type CustomerOnboardingStatusResponse = {
  data: { isComplete: boolean };
};

export async function getMobileCustomerOnboardingStatus() {
  return (
    await mobileApiRequest<CustomerOnboardingStatusResponse>(
      "/api/mobile/onboarding/customer",
      { authenticated: true, method: "GET" },
    )
  ).data;
}

export async function completeMobileCustomerOnboarding(phone?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MOBILE_AUTH_FLOW_TIMEOUT_MS,
  );

  try {
    return (
      await mobileApiRequest<CustomerOnboardingResponse>(
        "/api/mobile/onboarding/customer",
        {
          authenticated: true,
          body: phone === undefined ? {} : { phone },
          method: "POST",
          signal: controller.signal,
        },
      )
    ).data;
  } finally {
    clearTimeout(timeout);
  }
}
