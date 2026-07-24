import { assertNoPlatformJobQuery } from "@/features/platform-jobs/api/validation";
import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { communicationsPaymentAutomationStatus } from "@/features/communications-payment-automation/services/admin";

export function GET(request: Request) {
  return handlePlatformJobAdminRequest("gate6c.status", "PLATFORM_JOBS_MANAGE", (context) => {
    assertNoPlatformJobQuery(new URL(request.url));
    return communicationsPaymentAutomationStatus(context);
  });
}
