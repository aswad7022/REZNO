import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { parseVersionMutation, routeUuid } from "@/features/storage/api/validation";
import { abortUpload } from "@/features/storage/services/storage-mutations";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return handleStorageRequest(request, "customer", "session.abort", async (actor) =>
    abortUpload(actor, { ...await parseVersionMutation(request), sessionId: routeUuid(sessionId, "sessionId") }), 20);
}
