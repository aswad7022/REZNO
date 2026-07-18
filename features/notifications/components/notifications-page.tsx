import { randomUUID } from "node:crypto";

import { BellRing, CheckCheck } from "lucide-react";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  markAllNotificationsReadAction,
  mutateNotificationStateAction,
  updateNotificationPreferencesAction,
} from "@/features/notifications/actions/inbox-actions";
import { parseNotificationInboxQuery } from "@/features/notifications/api/validation";
import { resolveNotificationActor } from "@/features/notifications/services/context";
import { listNotificationInbox } from "@/features/notifications/services/inbox-service";
import { getNotificationPreferences } from "@/features/notifications/services/interaction-service";
import type { DashboardRole } from "@/types/dashboard";
import { OutboundPreferences } from "@/features/communications/components/outbound-preferences";
import { getOutboundPreferences } from "@/features/communications/services/preferences";
import { requireActiveIdentity } from "@/features/identity/server";

type RawSearchParams = Record<string, string | string[] | undefined>;

export async function NotificationsPage({ role, searchParams = {} }: { role: DashboardRole; searchParams?: RawSearchParams }) {
  const mode = role === "business" ? "business" : "customer";
  const params = toUrlSearchParams(searchParams);
  const query = parseNotificationInboxQuery(params);
  const context = await resolveNotificationActor(mode);
  const identity = await requireActiveIdentity();
  const [result, preferences, outboundPreferences, t, format, locale] = await Promise.all([
    listNotificationInbox(context, query),
    getNotificationPreferences(context.personId),
    getOutboundPreferences({ personId: context.personId, userId: identity.session.user.id }),
    getTranslations("Notifications"),
    getFormatter(),
    getLocale(),
  ]);
  const copy = notificationCenterCopy(locale);
  const basePath = `/${mode}/notifications`;
  const notice = typeof searchParams.notice === "string" ? searchParams.notice : null;

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />

      {notice ? <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">{copy.notice(notice)}</p> : null}

      <div className="flex flex-wrap items-center gap-2" aria-label={copy.filtersLabel}>
        {(["all", "unread", "read", "important", "archived"] as const).map((filter) => (
          <Button key={filter} asChild size="sm" variant={query.filter === filter ? "default" : "outline"}>
            <Link href={`${basePath}?filter=${filter}`}>{copy.filters[filter]}</Link>
          </Button>
        ))}
        <Badge variant="secondary">{copy.unread}: {result.unreadCount}</Badge>
        {result.unreadCount > 0 ? (
          <form action={markAllNotificationsReadAction} className="ms-auto">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="snapshot" value={result.snapshot} />
            <input type="hidden" name="expectedVersion" value={result.inboxVersion} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <Button size="sm" variant="outline"><CheckCheck className="size-4" />{copy.markAll}</Button>
          </form>
        ) : null}
      </div>

      {result.data.length === 0 ? (
        <DashboardEmpty icon={BellRing} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {result.data.map((notification) => (
              <article key={notification.id} className={`p-4 sm:p-5 ${notification.read ? "opacity-75" : "bg-primary/[0.025]"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={notification.read ? "secondary" : "default"}>{copy.categories[notification.category]}</Badge>
                      {notification.mandatory ? <Badge variant="destructive">{copy.mandatory}</Badge> : null}
                      {!notification.read ? <span className="size-2 rounded-full bg-primary" aria-label={copy.unread} /> : null}
                    </div>
                    <Link href={notification.destination.href} className="mt-2 block font-semibold text-primary hover:underline">
                      {notification.title}
                    </Link>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p>
                    <time dateTime={notification.createdAt} className="mt-2 block text-xs text-muted-foreground">
                      {format.relativeTime(new Date(notification.createdAt))}
                    </time>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <StateForm mode={mode} notificationId={notification.id} version={notification.stateVersion}
                      action={notification.read ? "MARK_UNREAD" : "MARK_READ"} label={notification.read ? copy.markUnread : copy.markRead} />
                    <StateForm mode={mode} notificationId={notification.id} version={notification.stateVersion}
                      action={notification.archived ? "RESTORE" : "ARCHIVE"} label={notification.archived ? copy.restore : copy.archive} />
                  </div>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      )}

      {result.pageInfo.nextCursor ? (
        <Button asChild variant="outline">
          <Link href={`${basePath}?${pageQuery(params, result.pageInfo.nextCursor)}`}>{copy.next}</Link>
        </Button>
      ) : null}

      <Card>
        <CardHeader><CardTitle>{copy.preferences}</CardTitle></CardHeader>
        <CardContent>
          <form action={updateNotificationPreferencesAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="expectedVersion" value={preferences.version} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            {([
              ["bookingsEnabled", "BOOKINGS"], ["restaurantEnabled", "RESTAURANT"], ["commerceEnabled", "COMMERCE"],
              ["messagesEnabled", "MESSAGES"], ["adminAnnouncementsEnabled", "ADMIN_ANNOUNCEMENT"],
            ] as const).map(([name, category]) => (
              <label key={name} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <input type="checkbox" name={name} defaultChecked={preferences[name]} className="size-4" />
                {copy.categories[category]}
              </label>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">{copy.preferenceHelp}</p>
            <Button type="submit" className="sm:col-span-2 sm:justify-self-start">{copy.save}</Button>
          </form>
        </CardContent>
      </Card>
      <OutboundPreferences initial={outboundPreferences} />
    </DashboardShell>
  );
}

function StateForm({ action, label, mode, notificationId, version }: {
  action: "ARCHIVE" | "MARK_READ" | "MARK_UNREAD" | "RESTORE"; label: string; mode: "business" | "customer";
  notificationId: string; version: number;
}) {
  return (
    <form action={mutateNotificationStateAction}>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="notificationId" value={notificationId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
      <Button type="submit" size="sm" variant="ghost">{label}</Button>
    </form>
  );
}

function toUrlSearchParams(value: RawSearchParams) {
  const params = new URLSearchParams();
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) child.forEach((item) => params.append(key, item));
    else if (child !== undefined) params.set(key, child);
  }
  params.delete("notice");
  return params;
}

function pageQuery(params: URLSearchParams, cursor: string) {
  const next = new URLSearchParams(params);
  next.set("cursor", cursor);
  return next.toString();
}

function notificationCenterCopy(locale: string) {
  const ar = locale.toLowerCase().startsWith("ar");
  const ku = locale.toLowerCase().startsWith("ku");
  const categories = ar ? { BOOKINGS: "الحجوزات", RESTAURANT: "المطاعم", COMMERCE: "التجارة", MESSAGES: "الرسائل", ACCOUNT: "الحساب", ADMIN_ANNOUNCEMENT: "إعلانات المنصة" } :
    ku ? { BOOKINGS: "حجزەکان", RESTAURANT: "چێشتخانە", COMMERCE: "بازرگانی", MESSAGES: "پەیامەکان", ACCOUNT: "هەژمار", ADMIN_ANNOUNCEMENT: "ڕاگەیاندن" } :
      { BOOKINGS: "Bookings", RESTAURANT: "Restaurant", COMMERCE: "Commerce", MESSAGES: "Messages", ACCOUNT: "Account", ADMIN_ANNOUNCEMENT: "Platform announcements" };
  return ar ? {
    archive: "أرشفة", categories, filters: { all: "الكل", archived: "المؤرشف", important: "المهم", read: "مقروء", unread: "غير مقروء" },
    filtersLabel: "مرشحات الإشعارات", mandatory: "إلزامي", markAll: "تحديد الكل كمقروء", markRead: "تحديد كمقروء", markUnread: "تحديد كغير مقروء", next: "المزيد", preferenceHelp: "الإشعارات الإلزامية للأمان وحالة الطلب لا يمكن تعطيلها.", preferences: "تفضيلات الإشعارات", restore: "استعادة", save: "حفظ التفضيلات", unread: "غير مقروء", notice: noticeText,
  } : ku ? {
    archive: "ئەرشیف", categories, filters: { all: "هەموو", archived: "ئەرشیف", important: "گرنگ", read: "خوێندراوە", unread: "نەخوێندراوە" },
    filtersLabel: "پاڵاوتنی ئاگادارکردنەوە", mandatory: "پێویست", markAll: "هەمووی وەک خوێندراوە", markRead: "خوێندراوە", markUnread: "نەخوێندراوە", next: "زیاتر", preferenceHelp: "ئاگادارکردنەوە پێویستەکانی ئاسایش و دۆخی داواکاری ناخرێنە کوژاندنەوە.", preferences: "هەڵبژاردەکان", restore: "گەڕاندنەوە", save: "پاشەکەوت", unread: "نەخوێندراوە", notice: noticeText,
  } : {
    archive: "Archive", categories, filters: { all: "All", archived: "Archived", important: "Important", read: "Read", unread: "Unread" },
    filtersLabel: "Notification filters", mandatory: "Mandatory", markAll: "Mark all read", markRead: "Mark read", markUnread: "Mark unread", next: "More", preferenceHelp: "Mandatory security and order-state notifications cannot be disabled.", preferences: "Notification preferences", restore: "Restore", save: "Save preferences", unread: "Unread", notice: noticeText,
  };
}

function noticeText(code: string) {
  if (code === "updated" || code === "all-read" || code === "preferences-updated") return "Notification settings updated.";
  if (code === "stale_version") return "This notification changed in another session. Refresh and try again.";
  return "The notification request could not be completed.";
}
