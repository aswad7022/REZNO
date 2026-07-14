import type { ConversationType, SystemRole } from "@prisma/client";

import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";

export type ConversationAccessRecord = {
  adminUserId: string | null;
  businessId: string | null;
  customerId: string | null;
  type: ConversationType;
};

export type ConversationActor =
  | { kind: "admin"; userId: string }
  | { kind: "customer"; personId: string }
  | {
      kind: "business";
      organizationId: string;
      systemRole: SystemRole | null;
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
    return (
      (conversation.type === "CUSTOMER_BUSINESS" ||
        conversation.type === "ADMIN_USER") &&
      conversation.customerId === actor.personId
    );
  }

  return (
    canAccessOrganizationConversations(actor.systemRole) &&
    (conversation.type === "CUSTOMER_BUSINESS" ||
      conversation.type === "ADMIN_BUSINESS") &&
    conversation.businessId === actor.organizationId
  );
}

export function adminConversationWhere(userId: string) {
  return {
    adminUserId: userId,
    type: { in: ["ADMIN_USER", "ADMIN_BUSINESS"] as ConversationType[] },
  };
}
