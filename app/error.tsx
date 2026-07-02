"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <main className="grid min-h-[70vh] place-items-center p-6 text-center">
      <div>
        <AlertTriangle className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">{t("title")}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {t("publicDescription")}
        </p>
        <Button className="mt-5" onClick={reset}>
          <RotateCcw />
          {t("retry")}
        </Button>
      </div>
    </main>
  );
}
