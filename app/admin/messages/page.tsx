import {
  MessagesPage,
  type MessagesPageQuery,
} from "@/features/messages/components/messages-page";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";

export default async function AdminMessagesRoute({
  searchParams,
}: {
  searchParams: Promise<MessagesPageQuery>;
}) {
  await requireAdminPermission("MESSAGES_VIEW");

  return <MessagesPage query={await searchParams} role="admin" />;
}
