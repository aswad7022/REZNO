"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardNotification } from "@/features/notifications/types";
import type { DashboardRole } from "@/types/dashboard";

export function DashboardNotifications({
  role,
  items,
  unreadCount,
}: {
  role: DashboardRole;
  items: DashboardNotification[];
  unreadCount: number;
}) {
  const t = useTranslations("Notifications");
  const format = useFormatter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("open")}
          className="relative hover:bg-primary/10"
        >
          <Bell />
          {unreadCount > 0 ? (
            <span
              className="absolute -end-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-5 text-primary-foreground ring-2 ring-background"
              aria-label={`${Math.min(unreadCount, 100)} unread notifications`}
            >{unreadCount > 99 ? "99+" : unreadCount}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-primary/10 shadow-2xl shadow-slate-950/10"
      >
        <DropdownMenuLabel className="text-sm text-foreground">
          {t("title")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block border-b px-3 py-3 text-sm transition-colors last:border-0 hover:bg-primary/5"
              >
                <p className="line-clamp-2 font-medium">
                  {item.kind === "ADMIN_ANNOUNCEMENT"
                    ? item.title
                    : t(`statuses.${item.status ?? "PENDING"}`, {
                        service: item.serviceName,
                        customer: item.customerName,
                      })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format.relativeTime(new Date(item.createdAt))}
                </p>
              </Link>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href={`/${role}/notifications`}>{t("viewAll")}</Link>
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
