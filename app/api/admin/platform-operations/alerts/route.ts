import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import { parseAlertListQuery } from "@/features/platform-operations/api/validation";
import { listPlatformAlerts } from "@/features/platform-operations/services/queries";

export async function GET(request: Request) {
  return handlePlatformOperationsAdminRequest(
    "alerts.list",
    "PLATFORM_OPERATIONS_VIEW",
    (context) => listPlatformAlerts(
      context,
      parseAlertListQuery(new URL(request.url)),
    ),
  );
}
