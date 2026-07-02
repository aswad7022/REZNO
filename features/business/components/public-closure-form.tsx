"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPublicClosure,
  type PublicClosureState,
} from "@/features/business/actions/manage-public-closures";

const initialState: PublicClosureState = { status: "idle" };

export function PublicClosureForm({
  branches,
}: {
  branches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("PublicProfileManagement");
  const [state, action, pending] = useActionState(
    createPublicClosure,
    initialState,
  );

  return (
    <form action={action} className="grid gap-3 rounded-xl bg-muted/40 p-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="closure-branch">{t("closureBranch")}</Label>
        <Select name="branchId" defaultValue={branches[0]?.id}>
          <SelectTrigger id="closure-branch" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="closure-reason">{t("closureReason")}</Label>
        <Input id="closure-reason" name="reason" maxLength={500} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="closure-start">{t("closureStart")}</Label>
        <Input id="closure-start" name="startsAt" type="datetime-local" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="closure-end">{t("closureEnd")}</Label>
        <Input id="closure-end" name="endsAt" type="datetime-local" required />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" size="sm" disabled={pending || !branches.length}>
          {t("addClosure")}
        </Button>
        {state.status === "error" ? (
          <p className="text-xs text-destructive">{t("closureError")}</p>
        ) : null}
      </div>
    </form>
  );
}
