"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const subscribeToHydration = () => () => undefined;

export function DashboardThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const isDark = mounted && resolvedTheme === "dark";
  const t = useTranslations("Dashboard");

  return (
    <Button
      aria-label={t(
        mounted && isDark ? "lightTheme" : "darkTheme",
      )}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
      variant="ghost"
      size="icon"
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
