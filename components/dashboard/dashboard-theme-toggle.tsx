"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function DashboardThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const t = useTranslations("Dashboard");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t(isDark ? "lightTheme" : "darkTheme")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
