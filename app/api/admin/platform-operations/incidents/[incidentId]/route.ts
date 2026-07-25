import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import { assertNoPlatformOperationsQuery } from "@/features/platform-operations/api/validation";
import { getPlatformIncidentDetail } from "@/features/platform-operations/services/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  return handlePlatformOperationsAdminRequest(
    "incidents.detail",
    "PLATFORM_OPERATIONS_VIEW",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return getPlatformIncidentDetail(context, (await params).incidentId);
    },
  );
}
