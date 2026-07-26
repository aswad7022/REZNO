import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { pushRouteErrorResponse } from "@/features/push-notifications/api/http";
import {
  parsePushReceiptEvents,
  parseReceiptProvider,
  readAuthenticatedReceiptBody,
} from "@/features/push-notifications/api/validation";
import { PUSH_RECEIPT_MAX_AGE_SECONDS } from "@/features/push-notifications/domain/contracts";
import { verifyPushReceiptSignature } from "@/features/push-notifications/domain/crypto";
import { pushNotificationError } from "@/features/push-notifications/domain/errors";
import { pushReceiptProviderConfigurationTruth } from "@/features/push-notifications/providers/native";
import { ingestPushProviderReceipts } from "@/features/push-notifications/services/receipts";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const provider = parseReceiptProvider((await context.params).provider);
    const authenticated = await readAuthenticatedReceiptBody(request);
    const timestampSeconds = Number(authenticated.timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      timestampSeconds > nowSeconds + 30
      || nowSeconds - timestampSeconds > PUSH_RECEIPT_MAX_AGE_SECONDS
      || !verifyPushReceiptSignature(authenticated)
    ) {
      pushNotificationError("RECEIPT_REJECTED", "Receipt authentication failed.");
    }
    if (pushReceiptProviderConfigurationTruth(provider) !== "CONFIGURED") {
      pushNotificationError(
        "PROVIDER_NOT_CONFIGURED",
        "The push receipt provider is not configured.",
      );
    }
    const events = parsePushReceiptEvents(authenticated.body, provider);
    const result = await ingestPushProviderReceipts(provider, events);
    return NextResponse.json(
      { data: result },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return pushRouteErrorResponse(error);
  }
}
