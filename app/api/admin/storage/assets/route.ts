import type { NextRequest } from "next/server";

import { handleAdminStorageRequest } from "@/features/storage/api/http";
import { parseAssetListQuery } from "@/features/storage/api/validation";
import { listStoredAssets } from "@/features/storage/services/storage-query";

export function GET(request: NextRequest) {
  return handleAdminStorageRequest("assets.list", "STORAGE_RECORDS_VIEW", (actor) =>
    listStoredAssets(actor, parseAssetListQuery(request.nextUrl)));
}
