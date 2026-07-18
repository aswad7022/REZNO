import type { ResolvedAdminGrant } from "@/features/admin/policies/admin-authorization";
import { resolvedAdminHasPermission } from "@/features/admin/policies/admin-authorization";
import type { AdminMessageActor } from "@/features/messages/domain/contracts";

export function refreshAdminMessageActor(
  actor: AdminMessageActor,
  grant: ResolvedAdminGrant,
): AdminMessageActor {
  return {
    ...actor,
    adminSource: grant.source,
    canSend: resolvedAdminHasPermission(grant, "MESSAGES_SEND"),
    canView: resolvedAdminHasPermission(grant, "MESSAGES_VIEW"),
  };
}
