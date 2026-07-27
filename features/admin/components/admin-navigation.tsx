"use client";

import Link from "next/link";
import { ArrowLeft, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface AdminNavigationItem {
  href: string;
  label: string;
}

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function AdminNavigationLinks({
  items,
  mobile = false,
}: {
  items: AdminNavigationItem[];
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return items.map((item) => {
    const active = isActive(pathname, item.href);
    const link = (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-11 min-w-11 items-center rounded-xl px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/45",
          active
            ? "bg-primary/12 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          mobile && "w-full",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary opacity-0",
            active && "opacity-100",
          )}
        />
        <span className="min-w-0 break-words">{item.label}</span>
      </Link>
    );

    return mobile ? (
      <SheetClose asChild key={item.href}>
        {link}
      </SheetClose>
    ) : (
      <div key={item.href}>{link}</div>
    );
  });
}

export function AdminNavigation({
  items,
}: {
  items: AdminNavigationItem[];
}) {
  const locale = useLocale();
  const t = useTranslations("Admin.navigation");

  return (
    <>
      <nav
        aria-label={t("label")}
        className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 lg:flex"
      >
        <AdminNavigationLinks items={items} />
      </nav>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="lg:hidden"
            aria-label={t("open")}
          >
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side={locale === "en" ? "left" : "right"}
          showCloseButton={false}
          className="w-[min(24rem,88vw)] overflow-y-auto"
        >
          <SheetHeader className="pe-14">
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute end-3 top-3"
              aria-label={t("close")}
            >
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
          <nav
            aria-label={t("label")}
            className="grid gap-1 px-4 pb-4"
          >
            <AdminNavigationLinks items={items} mobile />
            <SheetClose asChild>
              <Link
                href="/"
                className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/45"
              >
                <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                {t("backToSite")}
              </Link>
            </SheetClose>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
