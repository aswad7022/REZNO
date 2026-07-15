"use client";

import { useActionState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  acceptWorkInvitation,
  declineWorkInvitation,
} from "@/features/team/actions/manage-invitations";
import type { WorkInvitationActionState } from "@/features/team/actions/manage-invitations";

const initialWorkInvitationActionState: WorkInvitationActionState = {
  status: "idle",
};

export function WorkInvitationActions({
  idempotencyKey,
  invitationId,
}: {
  idempotencyKey: string;
  invitationId: string;
}) {
  const t = useTranslations("WorkInvitations");
  const [acceptState, acceptAction, accepting] = useActionState(
    acceptWorkInvitation.bind(null, invitationId),
    initialWorkInvitationActionState,
  );
  const [declineState, declineAction, declining] = useActionState(
    declineWorkInvitation.bind(null, invitationId),
    initialWorkInvitationActionState,
  );
  const message = acceptState.message ?? declineState.message;
  const isError =
    acceptState.status === "error" || declineState.status === "error";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={acceptAction}>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <Button type="submit" disabled={accepting || declining}>
            {accepting ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {t("accept")}
          </Button>
        </form>
        <form action={declineAction}>
          <Button
            type="submit"
            variant="outline"
            disabled={accepting || declining}
          >
            {declining ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <X aria-hidden="true" />
            )}
            {t("decline")}
          </Button>
        </form>
      </div>
      {message ? (
        <p
          role={isError ? "alert" : "status"}
          className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
