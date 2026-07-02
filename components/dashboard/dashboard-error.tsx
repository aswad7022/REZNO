"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <DashboardShell>
      <Card className="border-destructive/30">
        <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-xl bg-destructive/10">
            <AlertTriangle className="size-5 text-destructive" />
          </span>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t("description")}
          </p>
          {error.digest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("reference", { value: error.digest })}
            </p>
          ) : null}
          <Button className="mt-5" onClick={reset}>
            <RotateCcw />
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
