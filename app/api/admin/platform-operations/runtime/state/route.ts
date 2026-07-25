import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import {
  assertNoPlatformOperationsQuery,
  parseRuntimeState,
  readBoundedPlatformJobJson,
} from "@/features/platform-operations/api/validation";
import { setPlatformRuntimeEnabled } from "@/features/platform-operations/services/admin";

export async function POST(request: Request) {
  return handlePlatformOperationsAdminRequest(
    "runtime.state",
    "PLATFORM_OPERATIONS_MANAGE",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      return setPlatformRuntimeEnabled(
        context,
        parseRuntimeState(await readBoundedPlatformJobJson(request)),
      );
    },
  );
}
