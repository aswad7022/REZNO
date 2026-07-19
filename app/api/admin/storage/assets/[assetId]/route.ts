import type { NextRequest } from "next/server";

import { handleAdminStorageRequest } from "@/features/storage/api/http";
import { parseVersionMutation, routeUuid } from "@/features/storage/api/validation";
import { deleteStoredAsset, getStoredAsset } from "@/features/storage/services/storage-assets";

export async function GET(_request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handleAdminStorageRequest("asset.detail", "STORAGE_RECORDS_VIEW", (actor) =>
    getStoredAsset(actor, routeUuid(assetId, "assetId")));
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handleAdminStorageRequest("asset.delete", "STORAGE_RECORDS_MANAGE", async (actor) =>
    deleteStoredAsset(actor, { ...await parseVersionMutation(request), assetId: routeUuid(assetId, "assetId") }));
}
