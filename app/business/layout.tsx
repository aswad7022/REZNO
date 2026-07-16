import type { ReactNode } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";
import { requireBusinessIdentity } from "@/features/identity/server";
import { toDashboardUser } from "@/lib/auth/dashboard-user";
import {
  getDashboardMessagePreviews,
  getUnreadMessageCount,
} from "@/features/messages/services/messages";
import { getDashboardNotifications } from "@/features/notifications/services/notifications";
import { canPerformBusinessOperation } from "@/features/business-operations/domain/policy";

export default async function BusinessDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [identity, notifications] = await Promise.all([
    requireBusinessIdentity(),
    getDashboardNotifications("business"),
  ]);
  const { session, membership } = identity;
  const adminAccess = await getCurrentAdminAccess();
  const canAccessAdmin = Boolean(
    adminAccess?.isSuperAdmin ||
      adminAccess?.permissions.includes("ADMIN_DASHBOARD_VIEW"),
  );
  const canViewAdminMessages = Boolean(
    adminAccess?.isSuperAdmin || adminAccess?.permissions.includes("MESSAGES_VIEW"),
  );
  const canViewBusinessMessages = canAccessOrganizationConversations(
    membership.role.systemRole,
  );
  const messageRole = canViewAdminMessages ? "admin" : "business";
  const [unreadMessages, messagePreviews] =
    canViewAdminMessages || canViewBusinessMessages
      ? await Promise.all([
          getUnreadMessageCount(messageRole),
          getDashboardMessagePreviews(messageRole),
        ])
      : [0, []];

  return (
    <DashboardLayout
      role="business"
      user={toDashboardUser(session.user)}
      notifications={notifications}
      messagesHref={
        canViewAdminMessages
          ? "/admin/messages"
          : canViewBusinessMessages
            ? "/business/messages"
            : ""
      }
      unreadMessages={unreadMessages}
      messagePreviews={messagePreviews}
      isSuperAdmin={Boolean(adminAccess?.isSuperAdmin)}
      canAccessAdmin={canAccessAdmin}
      canAccessCustomerDashboard
      canAccessMessages={canViewAdminMessages || canViewBusinessMessages}
      publicSlug={
        canPerformBusinessOperation(membership.role.systemRole, "SETTINGS_READ")
          ? membership.organization.slug
          : undefined
      }
      vertical={membership.organization.vertical}
      systemRole={membership.role.systemRole}
      membershipId={membership.id}
      activeBusinessId={membership.organizationId}
      businesses={identity.accessibleBusinesses}
    >
      {children}
    </DashboardLayout>
  );
}
