import { getFormatter } from "next-intl/server";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminNotificationForm } from "@/features/notifications/components/admin-notification-form";
import { getAdminNotificationsPageData } from "@/features/notifications/services/admin-notifications";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminNotificationsPage() {
  const [data, format] = await Promise.all([
    getAdminNotificationsPageData(),
    getFormatter(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="الإشعارات العامة"
        description="إرسال إشعارات داخلية للعملاء وأصحاب الأنشطة أو نشاط/مستخدم محدد."
      />
      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle>إرسال إشعار</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminNotificationForm
            businesses={data.businesses}
            users={data.users}
          />
        </CardContent>
      </Card>
      <Card className="mt-6 border-primary/10">
        <CardHeader>
          <CardTitle>الإشعارات المرسلة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد إشعارات مرسلة بعد.
            </p>
          ) : (
            data.notifications.map((notification) => (
              <article key={notification.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{notification.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {notification.body}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{notification.audience}</Badge>
                    <Badge
                      variant={
                        notification.priority === "IMPORTANT"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {notification.priority}
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {format.dateTime(notification.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    hour12: true,
                  })}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
