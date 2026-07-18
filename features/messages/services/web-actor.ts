import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";
import type { MessageActor } from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";

export async function resolveMessageActor(
  mode: "admin" | "business" | "customer",
  permission: AdminPermission = "MESSAGES_VIEW",
): Promise<MessageActor> {
  if (mode === "customer") {
    const identity = await requireCustomerIdentity();
    return {
      kind: "customer",
      personId: identity.person.id,
      userId: identity.session.user.id,
    };
  }
  if (mode === "business") {
    const identity = await requireBusinessIdentity();
    const systemRole = identity.membership.role.systemRole;
    if (!systemRole) {
      messageError("FORBIDDEN", "A current system Business role is required.");
    }
    return {
      kind: "business",
      membershipId: identity.membership.id,
      organizationId: identity.membership.organizationId,
      personId: identity.person.id,
      roleId: identity.membership.role.id,
      systemRole,
      userId: identity.session.user.id,
    };
  }
  const admin = await requireAdminPermission(permission);
  return {
    adminSource: admin.source,
    canSend:
      admin.isSuperAdmin || admin.permissions.includes("MESSAGES_SEND"),
    kind: "admin",
    personId: admin.identity.person.id,
    userId: admin.identity.session.user.id,
  };
}
