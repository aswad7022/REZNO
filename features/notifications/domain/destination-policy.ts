import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";
import type { NotificationActorContext } from "@/features/notifications/domain/contracts";

type BusinessNotificationActor = Extract<NotificationActorContext, { mode: "business" }>;

export function canAccessBusinessCommerceOrderDestination(context: BusinessNotificationActor) {
  return context.effectiveCommercePermissions.includes("ORDER_VIEW");
}

export function canAccessBusinessMessagesDestination(context: BusinessNotificationActor) {
  return canAccessOrganizationConversations(context.systemRole);
}
