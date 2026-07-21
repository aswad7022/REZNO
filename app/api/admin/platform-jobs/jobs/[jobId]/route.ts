import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { getPlatformJobDetail } from "@/features/platform-jobs/services/queries";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return handlePlatformJobAdminRequest("jobs.detail", "PLATFORM_JOBS_VIEW", (actor) =>
    getPlatformJobDetail(actor, jobId));
}
