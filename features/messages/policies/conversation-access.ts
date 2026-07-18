import type { ConversationType } from "@prisma/client";

import {
  canAccessOrganizationConversations,
  canOperateBookings,
} from "@/features/identity/policies/authorization";

export type ConversationAccessRecord = {
  adminUserId: string | null;
  businessId: string | null;
  customerId: string | null;
  type: ConversationType;
  booking?: {
    customerId: string;
    memberId: string | null;
    organizationId: string;
  } | null;
};

export type ConversationActor =
  | { kind: "admin"; userId: string }
  | { kind: "customer"; personId: string }
  | {
      kind: "business";
      membershipId?: string;
      organizationId: string;
      systemRole: "MANAGER" | "OWNER" | "RECEPTIONIST" | "STAFF";
    };

/**
 * Participant identity and tenant id are checked together. An admin grant does
 * not imply access to another admin's conversation, and an organization member
 * does not become an admin. Receptionist/Staff organization-wide messaging is
 * intentionally denied until branch-level messaging policy is specified.
 */
export function canAccessConversation(
  conversation: ConversationAccessRecord,
  actor: ConversationActor,
): boolean {
  if (actor.kind === "admin") {
    return (
      (conversation.type === "ADMIN_USER" ||
        conversation.type === "ADMIN_BUSINESS") &&
      conversation.adminUserId === actor.userId
    );
  }

  if (actor.kind === "customer") {
    const participant =
      (conversation.type === "CUSTOMER_BUSINESS" ||
        conversation.type === "ADMIN_USER") &&
      conversation.customerId === actor.personId;
    if (!participant) return false;
    return !conversation.booking ||
      (conversation.booking.customerId === actor.personId &&
        conversation.booking.organizationId === conversation.businessId);
  }

  if (conversation.businessId !== actor.organizationId) return false;
  if (canAccessOrganizationConversations(actor.systemRole)) {
    return conversation.type === "CUSTOMER_BUSINESS" ||
      conversation.type === "ADMIN_BUSINESS";
  }
  if (
    actor.systemRole === "RECEPTIONIST" &&
    canOperateBookings(actor.systemRole)
  ) {
    return conversation.type === "CUSTOMER_BUSINESS" &&
      Boolean(
        conversation.booking &&
          conversation.booking.organizationId === actor.organizationId,
      );
  }
  return conversation.type === "CUSTOMER_BUSINESS" &&
    actor.systemRole === "STAFF" &&
    Boolean(
      conversation.booking &&
        conversation.booking.organizationId === actor.organizationId &&
        conversation.booking.memberId === actor.membershipId,
    );
}

export function adminConversationWhere(userId: string) {
  return {
    adminUserId: userId,
    type: { in: ["ADMIN_USER", "ADMIN_BUSINESS"] as ConversationType[] },
  };
}
