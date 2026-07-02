"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale } from "@/i18n/actions/set-locale";
import { isAppLocale, locales } from "@/i18n/config";

export function DashboardLanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Common");
  const [pending, startTransition] = useTransition();

  function changeLocale(value: string) {
    if (!isAppLocale(value) || value === locale) {
      return;
    }

    startTransition(async () => {
      await setLocale(value);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("language")}
          disabled={pending}
        >
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
          {locales.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`languages.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
