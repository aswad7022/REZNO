import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobTrigger, readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import { triggerPlatformJob } from "@/features/platform-jobs/services/mutations";

export function POST(request: Request) {
  return handlePlatformJobAdminRequest("jobs.trigger", "PLATFORM_JOBS_MANAGE", async (context) =>
    triggerPlatformJob(context, parsePlatformJobTrigger(await readBoundedPlatformJobJson(request))), 201);
}
