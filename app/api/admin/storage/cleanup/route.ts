import type { NextRequest } from "next/server";

import { handleAdminStorageRequest } from "@/features/storage/api/http";
import { parseCleanup } from "@/features/storage/api/validation";
import { runManualStorageCleanup } from "@/features/storage/services/storage-admin";

export function POST(request: NextRequest) {
  return handleAdminStorageRequest("cleanup.manual", "STORAGE_RECORDS_MANAGE", async (actor) =>
    runManualStorageCleanup(actor, await parseCleanup(request)));
}
