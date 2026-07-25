import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import {
  assertNoPlatformOperationsQuery,
  parseVersionedTarget,
  readBoundedPlatformJobJson,
} from "@/features/platform-operations/api/validation";
import { resolvePlatformIncident } from "@/features/platform-operations/services/lifecycle";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  return handlePlatformOperationsAdminRequest(
    "incidents.resolve",
    "PLATFORM_OPERATIONS_MANAGE",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return resolvePlatformIncident(context, {
        ...parseVersionedTarget(await readBoundedPlatformJobJson(request)),
        targetId: (await params).incidentId,
      });
    },
  );
}
