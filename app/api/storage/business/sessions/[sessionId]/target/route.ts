import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { parseVersionMutation, routeUuid } from "@/features/storage/api/validation";
import { issueUploadTarget } from "@/features/storage/services/storage-mutations";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  return handleStorageRequest(request, "business", "target.issue", async (actor) =>
    issueUploadTarget(actor, { ...await parseVersionMutation(request), sessionId: routeUuid(sessionId, "sessionId") }), 30);
}
