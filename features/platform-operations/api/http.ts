import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { PlatformJobDomainError, platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  platformJobAdminContext,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

export async function handlePlatformOperationsAdminRequest(
  scope: string,
  permission: AdminPermission,
  operation: (context: PlatformJobAdminContext) => Promise<unknown>,
  status: 200 | 201 = 200,
) {
  try {
    const access = await getCurrentAdminAccess();
    if (
      !access
      || (
        !access.isSuperAdmin
        && !access.permissions.includes(permission)
      )
    ) {
      platformJobError(
        "FORBIDDEN",
        "Current Admin platform-operations permission is required.",
      );
    }
    const context = platformJobAdminContext(access);
    const rate = await consumeRateLimit(
      `platform-operations.admin.${scope}`,
      `person:${context.personId}`,
      { limit: 30, windowMs: 60_000 },
    );
    if (rate.unavailable) {
      platformJobError(
        "SERVICE_UNAVAILABLE",
        "Request protection is temporarily unavailable.",
      );
    }
    if (!rate.success) {
      platformJobError(
        "RATE_LIMITED",
        "Too many platform-operations requests.",
      );
    }
    return NextResponse.json(
      { data: await operation(context) },
      { headers: NO_STORE, status },
    );
  } catch (error) {
    if (error instanceof PlatformJobDomainError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          headers: {
            ...NO_STORE,
            ...(error.code === "RATE_LIMITED"
            || error.code === "SERVICE_UNAVAILABLE"
              ? { "Retry-After": error.code === "RATE_LIMITED" ? "60" : "1" }
              : {}),
          },
          status: error.status,
        },
      );
    }
    logServerError(`platformOperations.http.${scope}`, error);
    return NextResponse.json(
      {
        error: {
          code: "PLATFORM_JOB_FAILURE",
          message: "The platform-operations request failed safely.",
        },
      },
      { headers: NO_STORE, status: 500 },
    );
  }
}
