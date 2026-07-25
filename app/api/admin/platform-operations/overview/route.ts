import {
  assertNoPlatformOperationsQuery,
} from "@/features/platform-operations/api/validation";
import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import { getPlatformOperationsOverview } from "@/features/platform-operations/services/queries";

export async function GET(request: Request) {
  return handlePlatformOperationsAdminRequest(
    "overview",
    "PLATFORM_OPERATIONS_VIEW",
    (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return getPlatformOperationsOverview(context);
    },
  );
}
