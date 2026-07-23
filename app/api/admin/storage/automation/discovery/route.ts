import {
  parseStorageAutomationDiscovery,
  readBoundedPlatformJobJson,
} from "@/features/platform-jobs/api/validation";
import { handleStorageAutomationAdminRequest } from "@/features/storage-automation/api/http";
import { triggerStorageAutomationDiscovery } from "@/features/storage-automation/services/admin";

export function POST(request: Request) {
  return handleStorageAutomationAdminRequest("discovery", async (context, storageActor) =>
    triggerStorageAutomationDiscovery(
      context,
      storageActor,
      parseStorageAutomationDiscovery(await readBoundedPlatformJobJson(request)),
    ), 201);
}
