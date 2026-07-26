import type { NextRequest } from "next/server";

import { handleCustomerPushRequest } from "@/features/push-notifications/api/http";
import {
  parseRegisterPushInstallation,
  parseRevokePushInstallation,
} from "@/features/push-notifications/api/validation";
import {
  registerPushInstallation,
  revokePushInstallation,
} from "@/features/push-notifications/services/installations";

export const dynamic = "force-dynamic";

export function PUT(request: NextRequest) {
  return handleCustomerPushRequest(
    request,
    "installation.register",
    async (context) => registerPushInstallation(
      context,
      await parseRegisterPushInstallation(request),
    ),
  );
}

export function DELETE(request: NextRequest) {
  return handleCustomerPushRequest(
    request,
    "installation.revoke",
    async (context) => revokePushInstallation(
      context,
      await parseRevokePushInstallation(request),
    ),
  );
}
