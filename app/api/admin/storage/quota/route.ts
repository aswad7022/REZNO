import { handleAdminStorageRequest } from "@/features/storage/api/http";
import { getStorageQuotaStatus } from "@/features/storage/services/storage-query";

export function GET() {
  return handleAdminStorageRequest("quota.status", "STORAGE_RECORDS_VIEW", getStorageQuotaStatus);
}
