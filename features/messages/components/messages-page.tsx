import { MessageSquare } from "lucide-react";
import { getFormatter } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdminStartConversationForm,
  ReplyForm,
} from "@/features/messages/components/message-forms";
import { getMessagesPageData } from "@/features/messages/services/messages";
import type { DashboardRole } from "@/types/dashboard";

export async function MessagesPage({
  role,
}: {
  role: DashboardRole | "admin";
}) {
  const [data, format] = await Promise.all([
    getMessagesPageData(role),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={role === "business" ? "رسائل النشاط" : role === "customer" ? "رسائل العملاء" : "الرسائل"}
        description="محادثات نصية مرتبطة بالحجوزات بين العملاء والأنشطة."
      />
      {role === "admin" ? (
        <Card className="mb-5 border-primary/10">
          <CardHeader>
            <CardTitle>رسالة من الإدارة</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminStartConversationForm
              businesses={data.businesses}
              users={data.users}
            />
          </CardContent>
        </Card>
      ) : null}
      {data.conversations.length === 0 ? (
        <DashboardEmpty
          icon={MessageSquare}
          title="لا توجد محادثات"
          description="ستظهر المحادثات هنا عند إرسال أول رسالة."
        />
      ) : (
        <div className="grid gap-4">
          {data.conversations.map((conversation) => (
            <Card key={conversation.id} className="border-primary/10">
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    {conversation.business?.name ??
                      conversation.customer?.displayName ??
                      conversation.customer?.firstName ??
                      conversation.adminUser?.name ??
                      conversation.adminUser?.email ??
                      "محادثة"}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format.dateTime(conversation.updatedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      hour12: true,
                    })}
                  </p>
                  {conversation.booking ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {conversation.booking.restaurantReservation
                        ? "حجز طاولة مرتبط"
                        : "حجز مرتبط"}
                      {" · "}
                      {conversation.booking.serviceNameSnapshot}
                      {" · "}
                      {format.dateTime(conversation.booking.startsAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        hour12: true,
                      })}
                    </p>
                  ) : null}
                </div>
                <Badge variant="secondary">{conversation.type}</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...conversation.messages].reverse().map((message) => (
                    <article
                      key={message.id}
                      className="rounded-2xl border bg-background/70 p-3"
                    >
                      <p className="text-sm font-medium">
                        {message.sender.name ?? message.sender.email}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                        {message.body}
                      </p>
                      <time
                        dateTime={message.createdAt.toISOString()}
                        className="mt-2 block text-xs text-muted-foreground"
                      >
                        {format.relativeTime(message.createdAt)}
                      </time>
                    </article>
                  ))}
                </div>
                <ReplyForm conversationId={conversation.id} role={role} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
