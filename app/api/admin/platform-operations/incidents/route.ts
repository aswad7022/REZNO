import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import { parseIncidentListQuery } from "@/features/platform-operations/api/validation";
import { listPlatformIncidents } from "@/features/platform-operations/services/queries";

export async function GET(request: Request) {
  return handlePlatformOperationsAdminRequest(
    "incidents.list",
    "PLATFORM_OPERATIONS_VIEW",
    (context) => listPlatformIncidents(
      context,
      parseIncidentListQuery(new URL(request.url)),
    ),
  );
}
