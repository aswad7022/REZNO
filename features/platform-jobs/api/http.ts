import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { PlatformJobDomainError, platformJobError } from "@/features/platform-jobs/domain/errors";
import { platformJobAdminContext, type PlatformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

export async function handlePlatformJobAdminRequest(
  scope: string,
  permission: AdminPermission,
  operation: (context: PlatformJobAdminContext) => Promise<unknown>,
  status: 200 | 201 = 200,
) {
  try {
    const access = await getCurrentAdminAccess();
    if (!access || (!access.isSuperAdmin && !access.permissions.includes(permission))) {
      platformJobError("FORBIDDEN", "Current Admin platform-job permission is required.");
    }
    const context = platformJobAdminContext(access);
    const rate = consumeRateLimit(`platform-jobs.admin.${scope}`, `person:${context.personId}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.success) platformJobError("RATE_LIMITED", "Too many platform-job requests.");
    return NextResponse.json({ data: await operation(context) }, { headers: NO_STORE, status });
  } catch (error) {
    if (error instanceof PlatformJobDomainError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { headers: NO_STORE, status: error.status },
      );
    }
    logServerError(`platformJobs.http.${scope}`, error);
    return NextResponse.json(
      { error: { code: "PLATFORM_JOB_FAILURE", message: "The platform-job request failed safely." } },
      { headers: NO_STORE, status: 500 },
    );
  }
}
