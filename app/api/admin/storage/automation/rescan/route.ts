import {
  parseStorageAutomationRescan,
  readBoundedPlatformJobJson,
} from "@/features/platform-jobs/api/validation";
import { handleStorageAutomationAdminRequest } from "@/features/storage-automation/api/http";
import { requestStoredAssetRescan } from "@/features/storage-automation/services/admin";

export function POST(request: Request) {
  return handleStorageAutomationAdminRequest("rescan", async (context, storageActor) =>
    requestStoredAssetRescan(
      context,
      storageActor,
      parseStorageAutomationRescan(await readBoundedPlatformJobJson(request)),
    ), 201);
}
