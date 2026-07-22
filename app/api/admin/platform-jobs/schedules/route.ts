import type { NextRequest } from "next/server";

import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobScheduleListQuery } from "@/features/platform-jobs/api/validation";
import { listPlatformJobSchedules } from "@/features/platform-jobs/services/queries";

export function GET(request: NextRequest) {
  return handlePlatformJobAdminRequest("schedules.list", "PLATFORM_JOBS_VIEW", (context) =>
    listPlatformJobSchedules(context, parsePlatformJobScheduleListQuery(request.nextUrl)));
}
