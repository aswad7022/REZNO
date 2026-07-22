import type { NextRequest } from "next/server";

import { handlePlatformJobAdminRequest } from "@/features/platform-jobs/api/http";
import { parsePlatformJobListQuery } from "@/features/platform-jobs/api/validation";
import { listPlatformJobs } from "@/features/platform-jobs/services/queries";

export function GET(request: NextRequest) {
  return handlePlatformJobAdminRequest("jobs.list", "PLATFORM_JOBS_VIEW", (context) =>
    listPlatformJobs(context, parsePlatformJobListQuery(request.nextUrl)));
}
