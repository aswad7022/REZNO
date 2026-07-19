import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { parseVersionMutation, routeUuid } from "@/features/storage/api/validation";
import { deleteStoredAsset, getStoredAsset } from "@/features/storage/services/storage-assets";

export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handleStorageRequest(request, "customer", "asset.detail", (actor) =>
    getStoredAsset(actor, routeUuid(assetId, "assetId")));
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  return handleStorageRequest(request, "customer", "asset.delete", async (actor) =>
    deleteStoredAsset(actor, { ...await parseVersionMutation(request), assetId: routeUuid(assetId, "assetId") }), 15);
}
