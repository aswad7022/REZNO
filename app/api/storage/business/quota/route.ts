import type { NextRequest } from "next/server";

import { handleStorageRequest } from "@/features/storage/api/http";
import { getStorageQuotaStatus } from "@/features/storage/services/storage-query";

export function GET(request: NextRequest) {
  return handleStorageRequest(request, "business", "quota.status", getStorageQuotaStatus);
}
