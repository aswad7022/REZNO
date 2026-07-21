import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobScheduleState, readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import { setPlatformJobScheduleEnabled } from "@/features/platform-jobs/services/schedules";

export async function POST(request: Request, route: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await route.params;
  return handlePlatformJobAdminRequest("schedules.state", "PLATFORM_JOBS_MANAGE", async (context) =>
    setPlatformJobScheduleEnabled(context, { ...parsePlatformJobScheduleState(await readBoundedPlatformJobJson(request)), scheduleId }));
}
