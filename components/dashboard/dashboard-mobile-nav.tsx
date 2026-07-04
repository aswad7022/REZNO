"use client";

import Link from "next/link";
import { Building2, CalendarDays, Menu, ShieldCheck } from "lucide-react";
import type { BusinessVertical } from "@prisma/client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  getDashboardNavigation,
  isNavigationItemActive,
} from "@/features/dashboard/navigation";
import type { DashboardRole } from "@/types/dashboard";

export function DashboardMobileNav({
  role,
  vertical,
  canAccessAdmin = false,
  canAccessCustomerDashboard = false,
  canAccessBusinessDashboard = false,
}: {
  role: DashboardRole;
  vertical?: BusinessVertical;
  canAccessAdmin?: boolean;
  canAccessCustomerDashboard?: boolean;
  canAccessBusinessDashboard?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  const groups = getDashboardNavigation(role, vertical);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t("openMenu")}
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={locale === "en" ? "left" : "right"}
        className="w-[min(19rem,calc(100vw-2rem))] gap-0 overflow-hidden bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="h-16 justify-center border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.25),transparent_16rem)]">
          <SheetTitle className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 font-bold text-white shadow-lg shadow-violet-950/30">
              R
            </span>
            <span className="text-white">REZNO</span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("navigation.label")}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav aria-label={t("navigation.label")} className="p-4">
            {groups.map((group) => (
              <div key={group.label} className="mb-6 last:mb-0">
                <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                  {t(`navigation.groups.${group.label}`)}
                </p>
                <div className="space-y-1">
                  {group.items
                    .flatMap((item) => [item, ...(item.children ?? [])])
                    .map((item) => {
                      const active = isNavigationItemActive(pathname, item.href);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                            active
                              ? "bg-white/12 text-white ring-1 ring-white/10"
                              : "text-sidebar-foreground/70 hover:bg-white/8 hover:text-white",
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {t(`navigation.items.${item.title}`)}
                        </Link>
                      );
                    })}
                </div>
              </div>
            ))}
            {(canAccessCustomerDashboard ||
              canAccessBusinessDashboard ||
              canAccessAdmin) ? (
              <div className="mt-6 border-t border-white/10 pt-4">
                {canAccessCustomerDashboard && role !== "customer" ? (
                  <Link
                    href="/customer"
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
                  >
                    <CalendarDays className="size-4" aria-hidden="true" />
                    {t("customerDashboard")}
                  </Link>
                ) : null}
                {canAccessBusinessDashboard && role !== "business" ? (
                  <Link
                    href="/business"
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
                  >
                    <Building2 className="size-4" aria-hidden="true" />
                    {t("businessDashboard")}
                  </Link>
                ) : null}
                {canAccessAdmin ? (
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
                  >
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    {t("adminDashboard")}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
