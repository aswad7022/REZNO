import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import {
  assertNoPlatformOperationsQuery,
  parseVersionedTarget,
  readBoundedPlatformJobJson,
} from "@/features/platform-operations/api/validation";
import { resolvePlatformAlert } from "@/features/platform-operations/services/lifecycle";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> },
) {
  return handlePlatformOperationsAdminRequest(
    "alerts.resolve",
    "PLATFORM_OPERATIONS_MANAGE",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return resolvePlatformAlert(context, {
        ...parseVersionedTarget(await readBoundedPlatformJobJson(request)),
        targetId: (await params).alertId,
      });
    },
  );
}
