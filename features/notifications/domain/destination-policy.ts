import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";
import type { NotificationActorContext } from "@/features/notifications/domain/contracts";

type BusinessNotificationActor = Extract<NotificationActorContext, { mode: "business" }>;

export function canAccessBusinessCommerceOrderDestination(context: BusinessNotificationActor) {
  return context.effectiveCommercePermissions.includes("ORDER_VIEW");
}

export function canAccessBusinessMessagesDestination(
  context: BusinessNotificationActor,
  conversation?: {
    booking: { memberId: string | null; organizationId: string } | null;
    businessId: string | null;
  },
) {
  if (canAccessOrganizationConversations(context.systemRole)) return true;
  if (
    !conversation?.booking ||
    conversation.businessId !== context.organizationId ||
    conversation.booking.organizationId !== context.organizationId
  ) {
    return false;
  }
  if (context.systemRole === "RECEPTIONIST") return true;
  return context.systemRole === "STAFF" &&
    conversation.booking.memberId === context.membershipId;
}
