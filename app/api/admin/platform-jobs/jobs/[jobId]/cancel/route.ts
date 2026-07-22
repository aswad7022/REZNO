import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobVersionedMutation, readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import { cancelPlatformJob } from "@/features/platform-jobs/services/mutations";

export async function POST(request: Request, route: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await route.params;
  return handlePlatformJobAdminRequest("jobs.cancel", "PLATFORM_JOBS_MANAGE", async (context) =>
    cancelPlatformJob(context, { ...parsePlatformJobVersionedMutation(await readBoundedPlatformJobJson(request)), jobId }));
}
