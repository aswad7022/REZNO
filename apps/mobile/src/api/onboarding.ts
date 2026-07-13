import { mobileApiRequest } from "./client";
import { MOBILE_AUTH_FLOW_TIMEOUT_MS } from "../config/api";

type CustomerOnboardingResponse = {
  data: { isOnboarded: true };
};

export async function completeMobileCustomerOnboarding() {
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
          method: "POST",
          signal: controller.signal,
        },
      )
    ).data;
  } finally {
    clearTimeout(timeout);
  }
}
