"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function DashboardCommandTrigger() {
  const t = useTranslations("CommandPalette");

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="hidden gap-2 border-primary/15 bg-card/80 text-muted-foreground shadow-sm hover:text-primary sm:flex"
      onClick={() => window.dispatchEvent(new Event("rezno:open-command-palette"))}
      aria-label={t("open")}
    >
      <Search className="size-4" />
      <span className="hidden xl:inline">{t("open")}</span>
      <kbd className="rounded-md border bg-muted/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
        ⌘K
      </kbd>
    </Button>
  );
}
