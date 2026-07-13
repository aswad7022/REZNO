import type { NextRequest } from "next/server";

import { serializeCustomerAddress } from "@/features/commerce/api/dto";
import { commerceCollection, commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseAddressCreate } from "@/features/commerce/api/validation";
import { createCustomerAddress, listCustomerAddresses } from "@/features/commerce/services/customer-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "addresses.read", async ({ personId }) =>
    commerceCollection((await listCustomerAddresses(personId)).map(serializeCustomerAddress)),
  { limit: 120 });
}

export function POST(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "addresses.mutate", async ({ personId }) =>
    commerceData(serializeCustomerAddress(await createCustomerAddress(personId, await parseAddressCreate(request))), 201),
  { limit: 30 });
}
