"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { CustomerState } from "@/components/customer/customer-state";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <DashboardShell>
      <CustomerState
        action={
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {t("retry")}
          </Button>
        }
        description={t("description")}
        reference={
          error.digest ? t("reference", { value: error.digest }) : undefined
        }
        title={t("title")}
        tone="error"
      />
    </DashboardShell>
  );
}
