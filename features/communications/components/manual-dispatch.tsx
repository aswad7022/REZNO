"use client";

import { useState, useTransition } from "react";

import { manuallyDispatchDueAction } from "@/features/communications/actions/admin-communications";
import { Button } from "@/components/ui/button";

export function ManualDispatch() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">Automatic production scheduling is not connected.</p>
      <p className="mt-1 text-xs text-amber-800">This authorized manual action starts due campaigns and processes a bounded batch. Results mean provider acceptance, not confirmed human delivery.</p>
      <Button className="mt-3" type="button" disabled={pending} onClick={() => startTransition(async () => {
        const result = await manuallyDispatchDueAction({
          idempotencyKey: crypto.randomUUID(),
          batchSize: 25,
          claimOwner: `admin-ui:${crypto.randomUUID()}`,
        });
        setMessage(result.ok ? JSON.stringify(result.data) : `${result.code}: ${result.message}`);
      })}>Dispatch due work now</Button>
      {message ? <p className="mt-2 break-all text-xs" role="status">{message}</p> : null}
    </div>
  );
}
