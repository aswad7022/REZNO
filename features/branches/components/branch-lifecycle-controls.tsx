"use client";

import { useActionState } from "react";
import { Archive, LoaderCircle, Power } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { archiveBranch, setBranchActive } from "@/features/branches/actions/manage-branch";
import { initialBranchActionState, type BranchDetails } from "@/features/branches/types";

function LifecycleForm({ branch, contextOrganizationId }: { branch: BranchDetails; contextOrganizationId: string }) {
  const t = useTranslations("Branches");
  const action = setBranchActive.bind(null, branch.id, branch.status !== "ACTIVE");
  const [state, formAction, pending] = useActionState(action, initialBranchActionState);
  return (
    <form
      action={formAction}
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(event) => {
        if (!window.confirm(t(branch.status === "ACTIVE" ? "confirmDeactivate" : "confirmActivate"))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? branch.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? branch.lifecycleIdempotencyKey} />
      {branch.status === "ACTIVE" ? (
        <div className="flex items-start gap-2">
          <Checkbox id={`confirm-${branch.id}`} name="confirmFutureReservations" />
          <Label htmlFor={`confirm-${branch.id}`} className="text-xs leading-5">{t("confirmFutureReservations")}</Label>
        </div>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Power />}
        {branch.status === "ACTIVE" ? t("deactivate") : t("activate")}
      </Button>
      {state.message ? <p role="status" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{state.message}</p> : null}
      {state.details?.total ? <p className="text-xs text-amber-700">{t("impact", { generic: state.details.genericBookings ?? 0, restaurant: state.details.restaurantReservations ?? 0 })}</p> : null}
    </form>
  );
}

function ArchiveForm({ branch, contextOrganizationId }: { branch: BranchDetails; contextOrganizationId: string }) {
  const t = useTranslations("Branches");
  const action = archiveBranch.bind(null, branch.id);
  const [state, formAction, pending] = useActionState(action, initialBranchActionState);
  return (
    <form
      action={formAction}
      className="space-y-2 rounded-lg border border-destructive/20 p-3"
      onSubmit={(event) => {
        if (!window.confirm(t("confirmArchive"))) event.preventDefault();
      }}
    >
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? branch.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? branch.archiveIdempotencyKey} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Archive />}
        {t("archive")}
      </Button>
      {state.message ? <p role="status" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{state.message}</p> : null}
    </form>
  );
}

export function BranchLifecycleControls({ branch, canArchive, contextOrganizationId }: { branch: BranchDetails; canArchive: boolean; contextOrganizationId: string }) {
  if (branch.status === "ARCHIVED") return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <LifecycleForm branch={branch} contextOrganizationId={contextOrganizationId} />
      {canArchive && branch.status === "INACTIVE" ? <ArchiveForm branch={branch} contextOrganizationId={contextOrganizationId} /> : null}
    </div>
  );
}
