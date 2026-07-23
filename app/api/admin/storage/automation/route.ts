import { assertNoPlatformJobQuery } from "@/features/platform-jobs/api/validation";
import { handleStorageAutomationAdminRequest } from "@/features/storage-automation/api/http";
import { storageAutomationStatus } from "@/features/storage-automation/services/admin";

export function GET(request: Request) {
  return handleStorageAutomationAdminRequest("status", async (context, storageActor) => {
    assertNoPlatformJobQuery(new URL(request.url));
    return storageAutomationStatus(context, storageActor);
  });
}
