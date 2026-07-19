import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { parseAssetListQuery } from "@/features/storage/api/validation";
import { listStoredAssets } from "@/features/storage/services/storage-query";

export function GET(request: NextRequest) {
  return handleStorageRequest(request, "business", "assets.list", (actor) =>
    listStoredAssets(actor, parseAssetListQuery(request.nextUrl)));
}
