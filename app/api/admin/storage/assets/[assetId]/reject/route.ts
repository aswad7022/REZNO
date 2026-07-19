import type { NextRequest } from "next/server";

import { handleAdminStorageRequest } from "@/features/storage/api/http";
import { parseVersionMutation, routeUuid } from "@/features/storage/api/validation";
import { rejectStoredAsset } from "@/features/storage/services/storage-admin";

export async function POST(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handleAdminStorageRequest("asset.reject", "STORAGE_RECORDS_MANAGE", async (actor) =>
    rejectStoredAsset(actor, { ...await parseVersionMutation(request), assetId: routeUuid(assetId, "assetId") }));
}
