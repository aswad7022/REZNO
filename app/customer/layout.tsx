import type { ReactNode } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { requireCustomerIdentity } from "@/features/identity/server";
import { toDashboardUser } from "@/lib/auth/dashboard-user";
import {
  getDashboardMessagePreviews,
  getUnreadMessageCount,
} from "@/features/messages/services/messages";
import { getDashboardNotifications } from "@/features/notifications/services/notifications";

export default async function CustomerDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [{ session }, notifications] = await Promise.all([
    requireCustomerIdentity(),
    getDashboardNotifications("customer"),
  ]);
  const adminAccess = await getCurrentAdminAccess();
  const canAccessAdmin = Boolean(
    adminAccess?.isSuperAdmin ||
      adminAccess?.permissions.includes("ADMIN_DASHBOARD_VIEW"),
  );
  const canViewAdminMessages = Boolean(
    adminAccess?.isSuperAdmin || adminAccess?.permissions.includes("MESSAGES_VIEW"),
  );
  const messageRole = canViewAdminMessages ? "admin" : "customer";
  const [unreadMessages, messagePreviews] = await Promise.all([
    getUnreadMessageCount(messageRole),
    getDashboardMessagePreviews(messageRole),
  ]);

  return (
    <DashboardLayout
      role="customer"
      user={toDashboardUser(session.user)}
      notifications={notifications}
      messagesHref={canViewAdminMessages ? "/admin/messages" : "/customer/messages"}
      unreadMessages={unreadMessages}
      messagePreviews={messagePreviews}
      isSuperAdmin={Boolean(adminAccess?.isSuperAdmin)}
      canAccessAdmin={canAccessAdmin}
    >
      {children}
    </DashboardLayout>
  );
}
