import type { NextRequest } from "next/server";

import { handleProviderWebhookRequest } from "@/features/payments/api/http";
import { readBoundedWebhook } from "@/features/payments/api/validation";
import { processPaymentProviderWebhook } from "@/features/payments/services/provider-events";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return handleProviderWebhookRequest("webhooks.deterministic", async () =>
    processPaymentProviderWebhook(await readBoundedWebhook(request)),
  );
}
