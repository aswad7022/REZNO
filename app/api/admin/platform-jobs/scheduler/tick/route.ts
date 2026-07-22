import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobSchedulerBatch, readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import { runPlatformSchedulerTick } from "@/features/platform-jobs/services/schedules";

export function POST(request: Request) {
  return handlePlatformJobAdminRequest("scheduler.tick", "PLATFORM_JOBS_MANAGE", async (context) =>
    runPlatformSchedulerTick(context, parsePlatformJobSchedulerBatch(await readBoundedPlatformJobJson(request))));
}
