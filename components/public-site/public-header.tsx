import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardUserNav } from "@/components/dashboard/dashboard-user-nav";
import { DashboardLanguageSwitcher } from "@/components/dashboard/dashboard-language-switcher";
import { DashboardThemeToggle } from "@/components/dashboard/dashboard-theme-toggle";
import { Button } from "@/components/ui/button";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { getOptionalActiveIdentity } from "@/features/identity/server";
import { toDashboardUser } from "@/lib/auth/dashboard-user";

export async function PublicHeader() {
  const [t, dashboardT, identity] = await Promise.all([
    getTranslations("Public"),
    getTranslations("Dashboard.navigation.items"),
    getOptionalActiveIdentity(),
  ]);
  const adminAccess = identity ? await getCurrentAdminAccess() : null;
  const dashboardHref = identity?.person.isOnboarded ? "/customer" : "/onboarding";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/82 shadow-sm shadow-slate-950/[0.03] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 text-primary-foreground shadow-lg shadow-primary/20">
            R
          </span>
          <span>REZNO</span>
        </Link>
        <nav className="ms-auto hidden items-center gap-1 sm:flex">
          <Button asChild variant="ghost">
            <Link href="/marketplace">{t("marketplace")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/register?intent=business">{t("forBusiness")}</Link>
          </Button>
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:ms-0">
          <DashboardLanguageSwitcher />
          <DashboardThemeToggle />
          {identity ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={dashboardHref}>
                  <CalendarDays aria-hidden="true" />
                  <span className="hidden min-[420px]:inline">
                    {dashboardT("dashboard")}
                  </span>
                </Link>
              </Button>
              <DashboardUserNav
                role="customer"
                user={toDashboardUser(identity.session.user)}
                isSuperAdmin={adminAccess?.isSuperAdmin ?? false}
                canAccessAdmin={Boolean(adminAccess)}
              />
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/register?mode=signin">
                <CalendarDays aria-hidden="true" />
                <span className="hidden min-[420px]:inline">{t("signIn")}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
