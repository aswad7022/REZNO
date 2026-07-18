import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConversationReadMarker } from "@/features/messages/components/conversation-read-marker";
import {
  AdminStartConversationForm,
  CustomerStartConversationForm,
  ReplyForm,
} from "@/features/messages/components/message-forms";
import { isUuid } from "@/features/messages/domain/contracts";
import { MessageDomainError } from "@/features/messages/domain/errors";
import { resolveMessageActor } from "@/features/messages/services/web-actor";
import {
  getConversationDetail,
  listConversations,
  listMessages,
  searchMessageTargets,
  type ConversationListMode,
} from "@/features/messages/services/query-service";
import type { DashboardRole } from "@/types/dashboard";

export interface MessagesPageQuery {
  conversationId?: string;
  cursor?: string;
  messageCursor?: string;
  mode?: string;
  q?: string;
  targetQuery?: string;
}

export async function MessagesPage({
  query,
  role,
}: {
  query: MessagesPageQuery;
  role: DashboardRole | "admin";
}) {
  const [t, format, actor] = await Promise.all([
    getTranslations("Messaging"),
    getFormatter(),
    resolveMessageActor(role),
  ]);
  const mode = parseMode(query.mode);
  const conversations = await listConversations(actor, {
    cursor: query.cursor,
    limit: 20,
    mode,
    search: query.q,
  });
  const selectedId = query.conversationId
    ? (isUuid(query.conversationId) ? query.conversationId : null)
    : conversations.data[0]?.id ?? null;
  if (query.conversationId && !selectedId) notFound();
  let detail = null;
  let messages = null;
  if (selectedId) {
    try {
      [detail, messages] = await Promise.all([
        getConversationDetail(actor, selectedId),
        listMessages(actor, selectedId, {
          cursor: query.messageCursor,
          limit: 30,
        }),
      ]);
    } catch (error) {
      if (error instanceof MessageDomainError && error.code === "NOT_FOUND") {
        notFound();
      }
      throw error;
    }
  }
  const canAdminSend = actor.kind !== "admin" || actor.canSend;
  const targets =
    role === "customer" || (role === "admin" && canAdminSend)
      ? await searchMessageTargets(actor, query.targetQuery, 20)
      : [];
  const basePath = `/${role}/messages`;
  const description =
    role === "customer"
      ? t("customerDescription")
      : role === "business"
        ? t("businessDescription")
        : t("adminDescription");

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={description} />

      {role === "customer" && targets.length ? (
        <StartCard title={t("startConversation")}>
          <CustomerStartConversationForm businesses={targets} />
        </StartCard>
      ) : null}

      {role === "admin" && canAdminSend ? (
        <StartCard title={t("startConversation")}>
          <form className="mb-4 flex gap-2" method="get">
            <input
              aria-label={t("searchTargets")}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"
              defaultValue={query.targetQuery}
              name="targetQuery"
              placeholder={t("searchTargets")}
            />
            <Button type="submit" variant="outline">{t("apply")}</Button>
          </form>
          <AdminStartConversationForm targets={targets} />
        </StartCard>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <section aria-label={t("title")} className="space-y-3">
          <form className="flex gap-2" method="get">
            <input
              aria-label={t("search")}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"
              defaultValue={query.q}
              name="q"
              placeholder={t("search")}
            />
            <input name="mode" type="hidden" value={mode} />
            <Button type="submit" variant="outline">{t("apply")}</Button>
          </form>
          <nav aria-label={t("title")} className="flex flex-wrap gap-2">
            {(["all", "unread", "booking", "admin"] as const).map((item) => (
              <Button asChild key={item} size="sm" variant={mode === item ? "default" : "outline"}>
                <Link href={pageHref(basePath, { mode: item, q: query.q })}>
                  {t(item)}
                </Link>
              </Button>
            ))}
          </nav>
          {conversations.data.length === 0 ? (
            <DashboardEmpty
              icon={MessageSquare}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            conversations.data.map((conversation) => (
              <Link
                aria-current={conversation.id === selectedId ? "page" : undefined}
                className="block"
                href={pageHref(basePath, {
                  conversationId: conversation.id,
                  mode,
                  q: query.q,
                })}
                key={conversation.id}
              >
                <Card className={conversation.id === selectedId ? "border-primary" : "border-primary/10"}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{conversation.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {conversation.lastMessagePreview}
                        </p>
                      </div>
                      {conversation.unread ? (
                        <Badge>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {format.relativeTime(new Date(conversation.lastMessageAt))}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
          {conversations.nextCursor ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={pageHref(basePath, {
                cursor: conversations.nextCursor,
                mode,
                q: query.q,
              })}>{t("loadMore")}</Link>
            </Button>
          ) : null}
        </section>

        <section aria-live="polite">
          {!detail || !messages ? (
            <DashboardEmpty
              icon={MessageSquare}
              title={t("selectTitle")}
              description={t("selectDescription")}
            />
          ) : (
            <Card className="border-primary/10">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{detail.title}</CardTitle>
                    {detail.source ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {detail.source.kind === "RESTAURANT_RESERVATION"
                          ? t("restaurantSource")
                          : t("bookingSource")}
                        {" · "}{detail.source.label}
                        {" · "}{format.dateTime(new Date(detail.source.startsAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="secondary">{detail.type}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...messages.data].reverse().map((message) => (
                    <article
                      className={message.own
                        ? "ms-auto max-w-[88%] rounded-2xl bg-primary p-3 text-primary-foreground"
                        : "max-w-[88%] rounded-2xl border bg-background/70 p-3"}
                      key={message.id}
                    >
                      <p className="text-xs font-medium opacity-80">
                        {senderLabel(message.sender, t)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                        {message.body}
                      </p>
                      <time className="mt-2 block text-xs opacity-70" dateTime={message.createdAt}>
                        {format.relativeTime(new Date(message.createdAt))}
                      </time>
                    </article>
                  ))}
                </div>
                {messages.nextCursor ? (
                  <Button asChild variant="ghost" className="mt-3 w-full">
                    <Link href={pageHref(basePath, {
                      conversationId: detail.id,
                      messageCursor: messages.nextCursor,
                      mode,
                      q: query.q,
                    })}>{t("loadOlder")}</Link>
                  </Button>
                ) : null}
                {detail.canReply ? (
                  <ReplyForm conversationId={detail.id} role={role} />
                ) : null}
                <ConversationReadMarker
                  conversationId={detail.id}
                  role={role}
                  throughMessageId={messages.data[0]?.id}
                />
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

function StartCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Card className="mb-5 border-primary/10">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function parseMode(value: string | undefined): ConversationListMode {
  return value === "unread" || value === "booking" || value === "admin"
    ? value
    : "all";
}

function pageHref(
  basePath: string,
  values: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function senderLabel(
  sender: "ADMIN" | "BUSINESS" | "CUSTOMER" | "YOU",
  t: (key: "adminSender" | "businessSender" | "customer" | "you") => string,
) {
  if (sender === "YOU") return t("you");
  if (sender === "ADMIN") return t("adminSender");
  if (sender === "CUSTOMER") return t("customer");
  return t("businessSender");
}
