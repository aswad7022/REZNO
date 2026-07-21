import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobWorkerBatch, readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import { runPlatformWorkerBatch } from "@/features/platform-jobs/services/worker";

export function POST(request: Request) {
  return handlePlatformJobAdminRequest("worker.run", "PLATFORM_JOBS_MANAGE", async (context) =>
    runPlatformWorkerBatch(context, parsePlatformJobWorkerBatch(await readBoundedPlatformJobJson(request))));
}
