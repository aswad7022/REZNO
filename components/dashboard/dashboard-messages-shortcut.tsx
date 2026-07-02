"use client";

import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardMessagePreview } from "@/features/messages/services/messages";

export function DashboardMessagesShortcut({
  href,
  unreadCount,
  items,
}: {
  href: string;
  unreadCount?: number;
  items: DashboardMessagePreview[];
}) {
  const t = useTranslations("Messages");
  const format = useFormatter();
  const visibleCount =
    typeof unreadCount === "number" && unreadCount > 99 ? "99+" : unreadCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative hover:bg-primary/10"
          aria-label={t("messages")}
        >
          <MessageSquareText />
          {visibleCount ? (
            <span
              className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-bold leading-5 text-primary-foreground ring-2 ring-background"
              aria-label={t("unreadMessages", { count: unreadCount ?? 0 })}
            >
              {visibleCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(23rem,calc(100vw-2rem))] rounded-2xl border-primary/10 shadow-2xl shadow-slate-950/10"
      >
        <DropdownMenuLabel className="text-sm text-foreground">
          {t("recentMessages")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium">{t("noRecentMessages")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("noMessagesYet")}
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block border-b px-3 py-3 text-sm transition-colors last:border-0 hover:bg-primary/5"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {item.title}
                    </span>
                    <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {item.preview || t("noMessagesYet")}
                    </span>
                  </span>
                  {item.unread ? (
                    <span
                      className="mt-1 size-2 rounded-full bg-primary"
                      aria-label={t("unreadMessages", { count: 1 })}
                    />
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {format.relativeTime(new Date(item.createdAt))}
                </span>
              </Link>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href={href}>{t("viewAllMessages")}</Link>
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
