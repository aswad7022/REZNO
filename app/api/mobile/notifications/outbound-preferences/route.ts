import type { NextRequest } from "next/server";

import { handleCustomerCommunicationRequest } from "@/features/communications/api/http";
import { parseOutboundPreferenceRequest } from "@/features/communications/api/validation";
import {
  getOutboundPreferences,
  updateOutboundPreferences,
} from "@/features/communications/services/preferences";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommunicationRequest(
    request,
    "outbound-preferences.read",
    (context) => getOutboundPreferences(context),
    60,
  );
}
export function PATCH(request: NextRequest) {
  return handleCustomerCommunicationRequest(
    request,
    "outbound-preferences.update",
    async (context) => updateOutboundPreferences(
      context,
      await parseOutboundPreferenceRequest(request),
    ),
    15,
  );
}
