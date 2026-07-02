import { MessagesPage } from "@/features/messages/components/messages-page";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";

export default async function AdminMessagesRoute() {
  await requireAdminPermission("MESSAGES_VIEW");

  return <MessagesPage role="admin" />;
}
