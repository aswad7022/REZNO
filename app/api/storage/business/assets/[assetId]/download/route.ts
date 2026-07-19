import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { assertEmptyStorageBody, routeUuid } from "@/features/storage/api/validation";
import { createDownloadTarget } from "@/features/storage/services/storage-assets";

export async function POST(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handleStorageRequest(request, "business", "download.issue", async (actor) => {
    await assertEmptyStorageBody(request);
    return createDownloadTarget(actor, routeUuid(assetId, "assetId"));
  }, 40);
}
