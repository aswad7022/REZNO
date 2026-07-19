"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { manuallyDispatchDueAction } from "@/features/communications/actions/admin-communications";
import { Button } from "@/components/ui/button";

export function ManualDispatch() {
  const t = useTranslations("Stage4Communications");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">{t("manualTitle")}</p>
      <p className="mt-1 text-xs text-amber-800">{t("manualDescription")}</p>
      <Button className="mt-3" type="button" disabled={pending} onClick={() => startTransition(async () => {
        const result = await manuallyDispatchDueAction({
          idempotencyKey: crypto.randomUUID(),
          batchSize: 25,
          claimOwner: `admin-ui:${crypto.randomUUID()}`,
        });
        setMessage(result.ok
          ? t("dispatchResult", {
              accepted: result.data.providerAccepted,
              failed: result.data.permanentFailure,
              retry: result.data.retryScheduled,
              suppressed: result.data.suppressed,
            })
          : t("requestFailed", { code: result.code }));
      })}>{t("dispatchNow")}</Button>
      {message ? <p className="mt-2 break-all text-xs" role="status">{message}</p> : null}
    </div>
  );
}
