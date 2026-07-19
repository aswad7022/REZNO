import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { StorageDomainError } from "@/features/storage/domain/errors";
import type { StorageActor, StorageAdminActor } from "@/features/storage/services/actor";
import { resolveStorageActorFromRequest, resolveStorageAdminActor } from "@/features/storage/services/web-actor";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";
import { getRequestRateLimitIdentifierFromHeaders } from "@/lib/security/rate-limit";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function handleStorageRequest(
  request: NextRequest,
  mode: "customer" | "business",
  scope: string,
  operation: (actor: StorageActor) => Promise<unknown>,
  limit = 30,
) {
  try {
    const actor = await resolveStorageActorFromRequest(request, mode);
    const rate = consumeRateLimit(`storage.${mode}.${scope}`, `person:${actor.personId}`, { limit, windowMs: 60_000 });
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many storage requests." } },
        { headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) }, status: 429 },
      );
    }
    return NextResponse.json({ data: await operation(actor) }, { headers: noStore, status: 200 });
  } catch (error) {
    return storageErrorResponse(error, scope);
  }
}

export async function handleAdminStorageRequest(
  scope: string,
  permission: AdminPermission,
  operation: (actor: StorageAdminActor) => Promise<unknown>,
) {
  try {
    const actor = await resolveStorageAdminActor(permission);
    const rate = consumeRateLimit(`storage.admin.${scope}`, `person:${actor.personId}`, { limit: 30, windowMs: 60_000 });
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many storage requests." } },
        { headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) }, status: 429 },
      );
    }
    return NextResponse.json({ data: await operation(actor) }, { headers: noStore, status: 200 });
  } catch (error) {
    return storageErrorResponse(error, scope);
  }
}

export async function handlePublicStorageRequest(
  request: Request,
  scope: string,
  operation: () => Promise<unknown>,
) {
  try {
    const identifier = getRequestRateLimitIdentifierFromHeaders(request.headers, `storage-public:${scope}`);
    const rate = consumeRateLimit(`storage.public.${scope}`, identifier, { limit: 120, windowMs: 60_000 });
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many storage requests." } },
        { headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) }, status: 429 },
      );
    }
    return NextResponse.json({ data: await operation() }, { headers: noStore, status: 200 });
  } catch (error) {
    return storageErrorResponse(error, scope);
  }
}

function storageErrorResponse(error: unknown, scope: string) {
  if (error instanceof StorageDomainError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { headers: noStore, status: error.status },
    );
  }
  logServerError(`storage.http.${scope}`, error);
  return NextResponse.json(
    { error: { code: "STORAGE_PROVIDER_FAILURE", message: "Storage request failed safely." } },
    { headers: noStore, status: 500 },
  );
}
