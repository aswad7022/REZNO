import { handlePlatformOperationsAdminRequest } from "@/features/platform-operations/api/http";
import {
  assertNoPlatformOperationsQuery,
  parseIdempotency,
  readBoundedPlatformJobJson,
} from "@/features/platform-operations/api/validation";
import { bootstrapPlatformSchedules } from "@/features/platform-operations/services/admin";

export async function POST(request: Request) {
  return handlePlatformOperationsAdminRequest(
    "schedules.bootstrap",
    "PLATFORM_OPERATIONS_MANAGE",
    async (context) => {
      assertNoPlatformOperationsQuery(new URL(request.url));
      const input = parseIdempotency(
        await readBoundedPlatformJobJson(request),
      );
      return bootstrapPlatformSchedules(context, input.idempotencyKey);
    },
    201,
  );
}
