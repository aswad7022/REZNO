import type { NextRequest } from "next/server";

import { commerceApiError } from "@/features/commerce/api/errors";
import { commerceData, handleMerchantCommerceRequest } from "@/features/commerce/api/http";
import { parseIdempotencyKey, parseRouteUuid, readJsonObject } from "@/features/commerce/api/validation";
import {
  advanceOrderFulfillment,
  cancelMerchantOrder,
  confirmOrder,
  rejectOrder,
} from "@/features/commerce/services/order-service";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  return handleMerchantCommerceRequest(request, "orders.transition", "ORDER_VIEW", async (context) => {
    const orderId = parseRouteUuid((await params).orderId, "orderId");
    const body = await readJsonObject(request, ["action", "expectedVersion", "reason", "returnedStock"]);
    if (typeof body.action !== "string" || typeof body.expectedVersion !== "string") {
      commerceApiError("INVALID_REQUEST", 400, "action and expectedVersion are required.");
    }
    const reference = {
      contextOrganizationId: context.organizationId,
      membershipId: context.membershipId,
      personId: context.personId,
    };
    const envelope = {
      expectedVersion: body.expectedVersion,
      idempotencyKey: parseIdempotencyKey(request),
      orderId,
    };
    let result;
    if (body.action === "confirm") result = await confirmOrder(reference, { ...envelope, action: "confirm" });
    else if (body.action === "reject") result = await rejectOrder(reference, { ...envelope, action: "reject", reason: body.reason as string });
    else if (body.action === "cancel") result = await cancelMerchantOrder(reference, {
      ...envelope,
      reason: body.reason as string,
      returnedStock: body.returnedStock as boolean,
    });
    else if (["start_preparing", "ready_for_pickup", "out_for_delivery", "delivery_failed", "retry_delivery", "finalize_pickup", "finalize_delivery"].includes(body.action)) {
      result = await advanceOrderFulfillment(reference, {
        ...envelope,
        action: body.action as "start_preparing",
        ...(body.reason === undefined ? {} : { reason: body.reason as string }),
      });
    } else commerceApiError("INVALID_REQUEST", 400, "Unsupported Order transition action.");
    return commerceData(result);
  }, { limit: 30 });
}
