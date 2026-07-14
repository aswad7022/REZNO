import type { CommercePermission } from "@prisma/client";
import type { NextRequest } from "next/server";

import { commerceApiError } from "@/features/commerce/api/errors";
import { resolveMerchantCommerceContext } from "@/features/commerce/services/authorization";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_BUSINESS_COOKIE = "rezno-active-business-id";

export interface CustomerApiContext {
  personId: string;
  userId: string;
}

export interface MerchantApiContext extends CustomerApiContext {
  organizationId: string;
  permissions: readonly CommercePermission[];
}

async function authenticatedPerson(request: NextRequest): Promise<CustomerApiContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) commerceApiError("UNAUTHENTICATED", 401, "Authentication is required.");
  const person = await prisma.person.findFirst({
    where: {
      authUserId: session.user.id,
      deletedAt: null,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!person) commerceApiError("UNAUTHENTICATED", 401, "An active customer profile is required.");
  return { personId: person.id, userId: session.user.id };
}

export function resolveCustomerApiContext(request: NextRequest) {
  return authenticatedPerson(request);
}

export async function resolveMerchantApiContext(
  request: NextRequest,
  permission: CommercePermission,
): Promise<MerchantApiContext> {
  const identity = await authenticatedPerson(request);
  const memberships = await prisma.organizationMember.findMany({
    where: {
      personId: identity.personId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
    },
    select: { organizationId: true, role: { select: { organizationId: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const valid = memberships.filter((item) => item.role.organizationId === item.organizationId);
  const selected = request.cookies.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const organizationId =
    valid.length === 1
      ? valid[0]!.organizationId
      : valid.find((item) => item.organizationId === selected)?.organizationId;
  if (!organizationId) commerceApiError("FORBIDDEN", 403, "An active Organization must be selected.");
  const context = await resolveMerchantCommerceContext(
    { organizationId, personId: identity.personId },
    permission,
  );
  return { ...identity, ...context };
}
