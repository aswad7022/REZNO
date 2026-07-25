import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import { assertNoPlatformOperationsQuery } from "@/features/platform-operations/api/validation";
import { getPlatformAlertDetail } from "@/features/platform-operations/services/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> },
) {
  return handlePlatformOperationsAdminRequest(
    "alerts.detail",
    "PLATFORM_OPERATIONS_VIEW",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return getPlatformAlertDetail(context, (await params).alertId);
    },
  );
}
