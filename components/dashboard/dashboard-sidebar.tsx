"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
} from "lucide-react";
import type { BusinessVertical } from "@prisma/client";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  getDashboardNavigation,
  isNavigationItemActive,
} from "@/features/dashboard/navigation";
import type {
  DashboardNavigationItem,
  DashboardRole,
} from "@/types/dashboard";

function NavigationLink({
  collapsed,
  item,
  nested = false,
}: {
  collapsed: boolean;
  item: DashboardNavigationItem;
  nested?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("Dashboard.navigation.items");
  const active = isNavigationItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? t(item.title) : undefined}
      className={cn(
        "group/link relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
        active
          ? "bg-white/12 text-white shadow-sm ring-1 ring-white/10"
          : "text-sidebar-foreground/68 hover:bg-white/8 hover:text-white",
        collapsed && "justify-center px-0",
        nested && !collapsed && "ms-4",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-2 start-0 w-0.5 rounded-full bg-violet-300 opacity-0 transition-opacity",
          active && "opacity-100",
        )}
        aria-hidden="true"
      />
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-violet-200" : "text-sidebar-foreground/55 group-hover/link:text-violet-100",
        )}
        aria-hidden="true"
      />
      <span className={cn("truncate", collapsed && "sr-only")}>
        {t(item.title)}
      </span>
      {item.badge && !collapsed ? (
        <span className="ms-auto text-xs">{item.badge}</span>
      ) : null}
    </Link>
  );
}

export function DashboardSidebar({
  collapsed,
  onCollapsedChange,
  role,
  vertical,
  canAccessAdmin = false,
  canAccessCustomerDashboard = false,
  canAccessBusinessDashboard = false,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  role: DashboardRole;
  vertical?: BusinessVertical;
  canAccessAdmin?: boolean;
  canAccessCustomerDashboard?: boolean;
  canAccessBusinessDashboard?: boolean;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  const groups = getDashboardNavigation(role, vertical);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 start-0 z-40 hidden border-e border-white/10 bg-sidebar text-sidebar-foreground shadow-2xl shadow-slate-950/10 transition-[width] duration-200 ease-out lg:flex lg:flex-col",
        collapsed ? "w-18" : "w-64",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,92,255,0.28),transparent_20rem),linear-gradient(180deg,rgba(255,255,255,0.05),transparent)]" />
      <div className="relative flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <Link
          href={`/${role}`}
          className="flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 font-bold text-white shadow-lg shadow-violet-950/30 ring-1 ring-white/20">
            R
          </span>
          <span
            className={cn(
              "truncate text-base font-bold tracking-tight text-white",
              collapsed && "sr-only",
            )}
          >
            REZNO
          </span>
        </Link>
      </div>
      <ScrollArea className="relative min-h-0 flex-1">
        <nav aria-label={t("navigation.label")} className="p-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-6 last:mb-0">
              <p
                className={cn(
                  "mb-2 px-3 text-[0.68rem] font-semibold tracking-wider text-sidebar-foreground/50 uppercase",
                  collapsed && "sr-only",
                )}
              >
                {t(`navigation.groups.${group.label}`)}
              </p>
              <div className="space-y-1">
                {group.items.map((item) =>
                  item.children && !collapsed ? (
                    <details
                      key={item.href}
                      open={isNavigationItemActive(pathname, item.href)}
                      className="group/nav"
                    >
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/68 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
                        <item.icon className="size-4" aria-hidden="true" />
                        <span className="truncate">
                          {t(`navigation.items.${item.title}`)}
                        </span>
                        <ChevronDown className="ms-auto size-3.5 transition-transform group-open/nav:rotate-180" />
                      </summary>
                      <div className="mt-1 space-y-1">
                        {item.children.map((child) => (
                          <NavigationLink
                            key={child.href}
                            item={child}
                            collapsed={false}
                            nested
                          />
                        ))}
                      </div>
                    </details>
                  ) : (
                    <NavigationLink
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
      <div className="relative border-t border-white/10 p-3">
        {canAccessCustomerDashboard && role !== "customer" ? (
          <Link
            href="/customer"
            title={collapsed ? t("customerDashboard") : undefined}
            className={cn(
              "mb-2 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
              collapsed && "justify-center px-0",
            )}
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {t("customerDashboard")}
            </span>
          </Link>
        ) : null}
        {canAccessBusinessDashboard && role !== "business" ? (
          <Link
            href="/business"
            title={collapsed ? t("businessDashboard") : undefined}
            className={cn(
              "mb-2 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
              collapsed && "justify-center px-0",
            )}
          >
            <Building2 className="size-4" aria-hidden="true" />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {t("businessDashboard")}
            </span>
          </Link>
        ) : null}
        {canAccessAdmin ? (
          <Link
            href="/admin"
            title={collapsed ? t("adminDashboard") : undefined}
            className={cn(
              "mb-2 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
              collapsed && "justify-center px-0",
            )}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span className={cn("truncate", collapsed && "sr-only")}>
              {t("adminDashboard")}
            </span>
          </Link>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={cn(
            "text-sidebar-foreground/75 hover:bg-white/8 hover:text-white",
            !collapsed && "w-full justify-start",
          )}
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={t(collapsed ? "expandSidebar" : "collapseSidebar")}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            locale === "en" ? <ChevronsRight /> : <ChevronsLeft />
          ) : locale === "en" ? (
            <ChevronsLeft />
          ) : (
            <ChevronsRight />
          )}
          {!collapsed ? <span>{t("collapseSidebar")}</span> : null}
        </Button>
      </div>
    </aside>
  );
}
