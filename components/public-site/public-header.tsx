import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardLanguageSwitcher } from "@/components/dashboard/dashboard-language-switcher";
import { DashboardThemeToggle } from "@/components/dashboard/dashboard-theme-toggle";
import { Button } from "@/components/ui/button";

export async function PublicHeader() {
  const t = await getTranslations("Public");

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
          <Button asChild size="sm">
            <Link href="/register?mode=signin">
              <CalendarDays aria-hidden="true" />
              <span className="hidden min-[420px]:inline">{t("signIn")}</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
