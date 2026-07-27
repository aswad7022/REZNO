"use client";

import { useTranslations } from "next-intl";

import { WorkspaceState } from "@/components/operations/workspace-surface";
import { Button } from "@/components/ui/button";

export default function AdminError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("Admin");

  return (
    <WorkspaceState
      title={t("workspaceError")}
      description={t("workspaceErrorDescription")}
      tone="error"
    >
      <Button type="button" variant="outline" onClick={unstable_retry}>
        {t("retry")}
      </Button>
    </WorkspaceState>
  );
}
