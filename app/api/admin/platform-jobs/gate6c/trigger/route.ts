import { triggerGate6CAutomation } from "@/features/communications-payment-automation/services/admin";
import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import {
  parseGate6CTrigger,
  readBoundedPlatformJobJson,
} from "@/features/platform-jobs/api/validation";

export function POST(request: Request) {
  return handlePlatformJobAdminRequest(
    "gate6c.trigger",
    "PLATFORM_JOBS_MANAGE",
    async (context) => triggerGate6CAutomation(
      context,
      parseGate6CTrigger(await readBoundedPlatformJobJson(request)),
    ),
    201,
  );
}
