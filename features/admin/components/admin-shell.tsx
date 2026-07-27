import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { DashboardLanguageSwitcher } from "@/components/dashboard/dashboard-language-switcher";
import { DashboardThemeToggle } from "@/components/dashboard/dashboard-theme-toggle";
import {
  AdminNavigation,
  type AdminNavigationItem,
} from "@/features/admin/components/admin-navigation";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import type { AdminPermission } from "@/features/admin/config/permissions";
import { hasAnyCommerceAdminPermission } from "@/features/admin/config/permissions";

const links = [
  ["/admin", "overview", "ADMIN_DASHBOARD_VIEW"],
  ["/admin/businesses", "businesses", "BUSINESSES_VIEW"],
  ["/admin/users", "users", "USERS_VIEW"],
  ["/admin/bookings", "bookings", "ADMIN_DASHBOARD_VIEW"],
  ["/admin/restaurants", "restaurants", "BUSINESSES_VIEW"],
  ["/admin/reviews", "reviews", "BUSINESSES_VIEW"],
  ["/admin/commerce", "commerce", "COMMERCE_ANY"],
  ["/admin/communications", "communications", "NOTIFICATIONS_VIEW"],
  ["/admin/messages", "messages", "MESSAGES_VIEW"],
  ["/admin/payments", "payments", "PAYMENTS_VIEW"],
  ["/admin/platform-jobs", "platformJobs", "PLATFORM_JOBS_VIEW"],
  ["/admin/platform-operations", "platformOperations", "PLATFORM_OPERATIONS_VIEW"],
  ["/admin/access", "access", "SUPER_ADMIN"],
  ["/admin/settings", "settings", "SETTINGS_VIEW"],
] as const;

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const [access, t] = await Promise.all([
    getCurrentAdminAccess(),
    getTranslations("Admin"),
  ]);
  const visibleLinks: AdminNavigationItem[] = links
    .filter(([, , permission]) =>
      permission === "SUPER_ADMIN"
        ? access?.isSuperAdmin
        : permission === "COMMERCE_ANY"
          ? Boolean(access?.isSuperAdmin || (access && hasAnyCommerceAdminPermission(access.permissions)))
        : access?.isSuperAdmin ||
          access?.permissions.includes(permission as AdminPermission),
    )
    .map(([href, label]) => ({
      href,
      label: t(`navigation.items.${label}`),
    }));

  return (
    <div
      className="rezno-premium-surface min-h-screen"
      data-business-admin-surface="admin"
    >
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 shadow-sm backdrop-blur-xl">
        <div className="rezno-container flex min-h-16 items-center gap-3 py-2">
          <Link
            href="/admin"
            className="flex min-h-11 min-w-11 shrink-0 items-center gap-3 rounded-xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Shield className="size-5" aria-hidden="true" />
            </span>
            <span className="hidden xl:inline">REZNO Super Admin</span>
          </Link>
          <AdminNavigation items={visibleLinks} />
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <DashboardLanguageSwitcher />
            <DashboardThemeToggle />
            <Button asChild variant="outline" size="sm" className="hidden xl:inline-flex">
              <Link href="/">
                <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                {t("backToSite")}
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main id="main-content" className="rezno-container py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-6 border-b border-border/70 pb-5">
      <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
        Super Admin
      </p>
      <h1 className="mt-2 text-balance text-2xl font-black tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}
