"use client";

import Link from "next/link";
import { BriefcaseBusiness, CalendarCheck2, Home, MessageSquareText, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

interface MobileAppShellNavProps {
  businessHref: string;
  customerHref?: string;
  bookingsHref?: string;
  messagesHref?: string;
  marketplaceHref?: string;
}

function isActive(pathname: string, href: string) {
  if (href === "/customer") return pathname === "/customer";
  if (href === "/marketplace") return pathname === "/marketplace";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileAppShellNav({
  businessHref,
  customerHref = "/customer",
  bookingsHref = "/customer/bookings",
  messagesHref = "/customer/messages",
  marketplaceHref = "/marketplace",
}: MobileAppShellNavProps) {
  const pathname = usePathname();
  const t = useTranslations("MobileAppNav");
  const items = [
    {
      href: customerHref,
      icon: Home,
      label: t("customer"),
    },
    {
      href: marketplaceHref,
      icon: Search,
      label: t("marketplace"),
    },
    {
      href: bookingsHref,
      icon: CalendarCheck2,
      label: t("bookings"),
    },
    {
      href: messagesHref,
      icon: MessageSquareText,
      label: t("messages"),
    },
    {
      href: businessHref,
      icon: BriefcaseBusiness,
      label: t("business"),
    },
  ];

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/94 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-10px_30px_rgb(15_23_42/0.10)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[0.68rem] font-semibold text-muted-foreground outline-none transition focus-visible:ring-3 focus-visible:ring-ring/40",
                active
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
