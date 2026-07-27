"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { CustomerState } from "@/components/customer/customer-state";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <main className="rezno-premium-surface grid min-h-screen min-w-0 place-items-center p-6">
      <CustomerState
        action={
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {t("retry")}
          </Button>
        }
        className="w-full max-w-xl"
        description={t("publicDescription")}
        reference={
          error.digest ? t("reference", { value: error.digest }) : undefined
        }
        title={t("title")}
        tone="error"
      />
    </main>
  );
}
