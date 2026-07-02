import { BellRing } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardNotifications } from "@/features/notifications/services/notifications";
import type { DashboardRole } from "@/types/dashboard";

export async function NotificationsPage({ role }: { role: DashboardRole }) {
  const [notifications, t, format] = await Promise.all([
    getDashboardNotifications(role, 40),
    getTranslations("Notifications"),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
      />
      {notifications.length === 0 ? (
        <DashboardEmpty
          icon={BellRing}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {notifications.map((notification) => (
              <article key={notification.id} className="p-4 sm:p-5">
                <Link
                  href={notification.href}
                  className="font-medium text-primary hover:underline"
                >
                  {notification.kind === "CHANGE_REQUEST"
                    ? t("changeRequest", {
                        service: notification.serviceName,
                      })
                    : notification.kind === "REVIEW_REQUEST"
                      ? t("reviewRequest", {
                          service: notification.serviceName,
                        })
                      : notification.kind === "ADMIN_ANNOUNCEMENT"
                        ? notification.title
                      : t(`statuses.${notification.status ?? "PENDING"}`, {
                          service: notification.serviceName,
                          customer: notification.customerName,
                        })}
                </Link>
                {notification.kind === "ADMIN_ANNOUNCEMENT" &&
                notification.body ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {notification.body}
                  </p>
                ) : null}
                <time
                  dateTime={notification.createdAt}
                  className="mt-1 block text-xs text-muted-foreground"
                >
                  {format.relativeTime(new Date(notification.createdAt))}
                </time>
              </article>
            ))}
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}
