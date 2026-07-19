"use client";

import { useTranslations } from "next-intl";

export default function AdminCommunicationsError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("Stage4Communications");
  return (
    <section className="rounded-xl border border-destructive/20 bg-background p-6">
      <h2 className="text-lg font-semibold">{t("invalidTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("invalidDescription")}
      </p>
      <button
        className="mt-4 rounded-md border px-4 py-2 text-sm font-medium"
        onClick={() => unstable_retry()}
        type="button"
      >
        {t("tryAgain")}
      </button>
    </section>
  );
}
