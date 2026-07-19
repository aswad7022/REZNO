import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { parseVersionMutation, routeUuid } from "@/features/storage/api/validation";
import { finalizeUpload } from "@/features/storage/services/storage-mutations";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return handleStorageRequest(request, "business", "upload.finalize", async (actor) =>
    finalizeUpload(actor, { ...await parseVersionMutation(request), sessionId: routeUuid(sessionId, "sessionId") }), 20);
}
