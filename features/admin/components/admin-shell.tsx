import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import type { AdminPermission } from "@/features/admin/config/permissions";
import { hasAnyCommerceAdminPermission } from "@/features/admin/config/permissions";

const links = [
  ["/admin", "نظرة عامة", "ADMIN_DASHBOARD_VIEW"],
  ["/admin/businesses", "الأنشطة", "BUSINESSES_VIEW"],
  ["/admin/users", "المستخدمون", "USERS_VIEW"],
  ["/admin/bookings", "الحجوزات", "ADMIN_DASHBOARD_VIEW"],
  ["/admin/restaurants", "المطاعم والكافيهات", "BUSINESSES_VIEW"],
  ["/admin/reviews", "المراجعات", "BUSINESSES_VIEW"],
  ["/admin/commerce", "التجارة", "COMMERCE_ANY"],
  ["/admin/communications", "الاتصالات", "NOTIFICATIONS_VIEW"],
  ["/admin/messages", "الرسائل", "MESSAGES_VIEW"],
  ["/admin/payments", "المدفوعات", "PAYMENTS_VIEW"],
  ["/admin/access", "صلاحيات الأدمن", "SUPER_ADMIN"],
  ["/admin/settings", "الإعدادات", "SETTINGS_VIEW"],
] as const;

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const [access, t] = await Promise.all([
    getCurrentAdminAccess(),
    getTranslations("Admin"),
  ]);
  const visibleLinks = links.filter(([, , permission]) =>
    permission === "SUPER_ADMIN"
      ? access?.isSuperAdmin
      : permission === "COMMERCE_ANY"
        ? Boolean(access?.isSuperAdmin || (access && hasAnyCommerceAdminPermission(access.permissions)))
      : access?.isSuperAdmin ||
        access?.permissions.includes(permission as AdminPermission),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/admin" className="flex items-center gap-3 font-bold">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Shield className="size-5" />
            </span>
            REZNO Super Admin
          </Link>
          <nav className="flex flex-wrap gap-2" aria-label="Admin navigation">
            {visibleLinks.map(([href, label]) => (
              <Button key={href} asChild variant="ghost" size="sm">
                <Link href={href}>{label}</Link>
              </Button>
            ))}
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("backToSite")}
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
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
    <div className="mb-6">
      <p className="text-sm font-semibold text-primary">Super Admin</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
