import { NotificationsPage } from "@/features/notifications/components/notifications-page";

export default async function CustomerNotificationsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <NotificationsPage role="customer" searchParams={await searchParams} />;
}
