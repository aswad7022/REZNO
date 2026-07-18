import "server-only";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { effectiveCommercePermissions } from "@/features/commerce/domain/merchant-access";
import type { NotificationActorContext } from "@/features/notifications/domain/contracts";
import { notificationError } from "@/features/notifications/domain/errors";
import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";

export async function resolveNotificationActor(
  mode: "business" | "customer",
): Promise<NotificationActorContext> {
  if (mode === "customer") {
    const identity = await requireCustomerIdentity();
    return { mode, personId: identity.person.id };
  }
  const identity = await requireBusinessIdentity();
  const role = identity.membership.role.systemRole;
  if (!role) notificationError("FORBIDDEN", "A system Business role is required for the Notification Center.");
  return {
    effectiveCommercePermissions: effectiveCommercePermissions(identity.membership.role),
    membershipId: identity.membership.id,
    mode,
    organizationId: identity.membership.organizationId,
    personId: identity.person.id,
    restaurant: isRestaurantVertical(identity.membership.organization.vertical),
    roleId: identity.membership.role.id,
    systemRole: role,
  };
}
