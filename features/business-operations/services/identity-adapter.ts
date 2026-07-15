import "server-only";

import { forbidden } from "next/navigation";

import { canPerformBusinessOperation, type BusinessOperationCapability } from "@/features/business-operations/domain/policy";
import type { BusinessOperationActorReference } from "@/features/business-operations/services/context";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function currentBusinessOperationReference(
  pageCapability?: BusinessOperationCapability,
): Promise<BusinessOperationActorReference> {
  const identity = await requireBusinessIdentity();
  if (
    pageCapability &&
    !canPerformBusinessOperation(identity.membership.role.systemRole, pageCapability)
  ) {
    forbidden();
  }
  return {
    contextOrganizationId: identity.membership.organizationId,
    membershipId: identity.membership.id,
    personId: identity.person.id,
  };
}
