import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import {
  assertNoPlatformOperationsQuery,
  parseVersionedTarget,
  readBoundedPlatformJobJson,
} from "@/features/platform-operations/api/validation";
import { acknowledgePlatformIncident } from "@/features/platform-operations/services/lifecycle";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  return handlePlatformOperationsAdminRequest(
    "incidents.acknowledge",
    "PLATFORM_OPERATIONS_MANAGE",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return acknowledgePlatformIncident(context, {
        ...parseVersionedTarget(await readBoundedPlatformJobJson(request)),
        targetId: (await params).incidentId,
      });
    },
  );
}
