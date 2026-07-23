import "server-only";

import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { PlatformJobDomainError, platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  platformJobAdminContext,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import type { StorageAdminActor } from "@/features/storage/services/actor";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

export async function handleStorageAutomationAdminRequest(
  scope: string,
  operation: (context: PlatformJobAdminContext, storageActor: StorageAdminActor) => Promise<unknown>,
  status: 200 | 201 = 200,
) {
  try {
    const access = await getCurrentAdminAccess();
    if (!access || (!access.isSuperAdmin
      && (!access.permissions.includes("PLATFORM_JOBS_MANAGE")
        || !access.permissions.includes("STORAGE_RECORDS_MANAGE")))) {
      platformJobError("FORBIDDEN", "Current Admin storage and platform-job permissions are required.");
    }
    const context = platformJobAdminContext(access);
    const rate = consumeRateLimit(`storage-automation.admin.${scope}`, `person:${context.personId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.success) platformJobError("RATE_LIMITED", "Too many storage-automation requests.");
    const storageActor: StorageAdminActor = { ...context, kind: "admin" };
    return NextResponse.json(
      { data: await operation(context, storageActor) },
      { headers: NO_STORE, status },
    );
  } catch (error) {
    if (error instanceof PlatformJobDomainError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { headers: NO_STORE, status: error.status },
      );
    }
    logServerError(`storageAutomation.http.${scope}`, error);
    return NextResponse.json(
      { error: { code: "PLATFORM_JOB_FAILURE", message: "The storage-automation request failed safely." } },
      { headers: NO_STORE, status: 500 },
    );
  }
}
