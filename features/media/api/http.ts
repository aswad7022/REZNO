import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { MediaDomainError } from "@/features/media/domain/errors";
import type { MediaTarget } from "@/features/media/domain/policy";
import { attachMedia, detachMedia, reorderMedia, replaceSingletonMedia, updateMediaAltText } from "@/features/media/services/media-lifecycle";
import { getMediaContainer } from "@/features/media/services/media-query";
import { StorageDomainError } from "@/features/storage/domain/errors";
import { resolveStorageActorFromRequest } from "@/features/storage/services/web-actor";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";
import { assertNoMediaQuery, parseAltMutation, parseAttachMedia, parseBindingMutation, parseReorderMedia } from "@/features/media/api/validation";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function mediaGet(request: NextRequest, mode: "business" | "customer", target: MediaTarget) {
  return handle(request, mode, "get", async (actor) => {
    assertNoMediaQuery(request);
    return getMediaContainer(actor, target);
  });
}

export async function mediaAttach(request: NextRequest, mode: "business" | "customer", target: MediaTarget, replace = false) {
  return handle(request, mode, replace ? "replace" : "attach", async (actor) => {
    assertNoMediaQuery(request);
    const input = await parseAttachMedia(request, target);
    return replace ? replaceSingletonMedia(actor, input) : attachMedia(actor, input);
  });
}

export async function mediaDetach(request: NextRequest, mode: "business" | "customer", target: MediaTarget, bindingId: string) {
  return handle(request, mode, "detach", async (actor) => {
    assertNoMediaQuery(request);
    return detachMedia(actor, await parseBindingMutation(request, target, bindingId));
  });
}

export async function mediaAlt(request: NextRequest, mode: "business" | "customer", target: MediaTarget, bindingId: string) {
  return handle(request, mode, "alt", async (actor) => {
    assertNoMediaQuery(request);
    return updateMediaAltText(actor, await parseAltMutation(request, target, bindingId));
  });
}

export async function mediaReorder(request: NextRequest, mode: "business" | "customer", target: MediaTarget) {
  return handle(request, mode, "reorder", async (actor) => {
    assertNoMediaQuery(request);
    const parsed = await parseReorderMedia(request, target);
    return reorderMedia(actor, { ...parsed, bindingIds: parsed.bindingIds as string[] });
  });
}

async function handle(
  request: NextRequest,
  mode: "business" | "customer",
  scope: string,
  operation: (actor: Awaited<ReturnType<typeof resolveStorageActorFromRequest>>) => Promise<unknown>,
) {
  try {
    const actor = await resolveStorageActorFromRequest(request, mode);
    const rate = consumeRateLimit(`media.${mode}.${scope}`, `person:${actor.personId}`, { limit: 30, windowMs: 60_000 });
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many media requests." } },
        { headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) }, status: 429 },
      );
    }
    return NextResponse.json({ data: await operation(actor) }, { headers: noStore });
  } catch (error) {
    return mediaErrorResponse(error, scope);
  }
}

export function mediaErrorResponse(error: unknown, scope: string) {
  if (error instanceof MediaDomainError || error instanceof StorageDomainError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { headers: noStore, status: error.status });
  }
  logServerError(`media.http.${scope}`, error);
  return NextResponse.json(
    { error: { code: "STORAGE_PROVIDER_FAILURE", message: "Media request failed safely." } },
    { headers: noStore, status: 500 },
  );
}

export async function mediaRouteResponse(scope: string, operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    return mediaErrorResponse(error, scope);
  }
}
