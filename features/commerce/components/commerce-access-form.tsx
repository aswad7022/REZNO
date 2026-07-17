"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { CommercePermission } from "@prisma/client";

import { updateCommerceAccessAction } from "@/features/commerce/actions/manage-merchant-store";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import { Button } from "@/components/ui/button";

const INITIAL: CommerceActionState = { message: "", ok: false };

export function CommerceAccessForm({ contextOrganizationId, idempotencyKey, role }: {
  contextOrganizationId: string;
  idempotencyKey: string;
  role: {
    assignablePermissions: readonly CommercePermission[];
    effectivePermissions: readonly CommercePermission[];
    expectedVersion: string;
    id: string;
    name: string;
    systemRole: string | null;
  };
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(updateCommerceAccessAction, INITIAL);
  const editable = role.systemRole === "MANAGER" || role.systemRole === "STAFF";
  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="expectedVersion" value={role.expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="roleId" value={role.id} />
      <div>
        <h2 className="font-bold">{role.name}</h2>
        <p className="text-sm text-muted-foreground">{role.systemRole}</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {role.assignablePermissions.map((permission) => (
          <label key={permission} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input type="checkbox" name="permissions" value={permission} defaultChecked={role.effectivePermissions.includes(permission)} disabled={!editable} />
            {permission}
          </label>
        ))}
        {role.assignablePermissions.length === 0 ? <p className="text-sm text-muted-foreground">{t("fixedRole")}</p> : null}
      </div>
      <p aria-live="polite" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{state.message}</p>
      {editable ? <Button type="submit" disabled={pending}>{pending ? t("saving") : t("saveAccess")}</Button> : null}
    </form>
  );
}
