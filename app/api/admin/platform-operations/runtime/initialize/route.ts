import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import {
  assertNoPlatformOperationsQuery,
  parseIdempotency,
  readBoundedPlatformJobJson,
} from "@/features/platform-operations/api/validation";
import { initializePlatformRuntime } from "@/features/platform-operations/services/admin";

export async function POST(request: Request) {
  return handlePlatformOperationsAdminRequest(
    "runtime.initialize",
    "PLATFORM_OPERATIONS_MANAGE",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      const input = parseIdempotency(
        await readBoundedPlatformJobJson(request),
      );
      return initializePlatformRuntime(context, input.idempotencyKey);
    },
    201,
  );
}
