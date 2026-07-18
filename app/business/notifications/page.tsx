import { NotificationsPage } from "@/features/notifications/components/notifications-page";

export default async function BusinessNotificationsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <NotificationsPage role="business" searchParams={await searchParams} />;
}
