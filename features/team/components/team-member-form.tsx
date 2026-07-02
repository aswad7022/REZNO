"use client";

import { useActionState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addTeamMember,
  updateTeamMember,
} from "@/features/team/actions/manage-team-member";
import {
  initialTeamMemberActionState,
  type TeamBranchOption,
  type TeamMemberDetails,
} from "@/features/team/types";

export function TeamMemberForm({
  branches,
  member,
}: {
  branches: TeamBranchOption[];
  member?: TeamMemberDetails;
}) {
  const t = useTranslations("Team");
  const common = useTranslations("Common");
  const action = member
    ? updateTeamMember.bind(null, member.id)
    : addTeamMember;
  const [state, formAction, pending] = useActionState(
    action,
    initialTeamMemberActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {!member ? (
          <div className="space-y-2">
            <Label htmlFor="team-email">{t("fields.email")}</Label>
            <Input
              id="team-email"
              name="email"
              type="email"
              dir="ltr"
              required
              aria-invalid={Boolean(state.fieldErrors?.email)}
              aria-describedby={
                state.fieldErrors?.email ? "team-email-error" : undefined
              }
            />
            {state.fieldErrors?.email ? (
              <p
                id="team-email-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {state.fieldErrors.email}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`team-role-${member?.id ?? "new"}`}>
            {t("fields.role")}
          </Label>
          <Select
            name="systemRole"
            defaultValue={
              member?.systemRole && member.systemRole !== "OWNER"
                ? member.systemRole
                : "STAFF"
            }
          >
            <SelectTrigger
              id={`team-role-${member?.id ?? "new"}`}
              className="w-full"
              aria-invalid={Boolean(state.fieldErrors?.systemRole)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MANAGER">{t("roles.MANAGER")}</SelectItem>
              <SelectItem value="RECEPTIONIST">
                {t("roles.RECEPTIONIST")}
              </SelectItem>
              <SelectItem value="STAFF">{t("roles.STAFF")}</SelectItem>
            </SelectContent>
          </Select>
          {state.fieldErrors?.systemRole ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.systemRole}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`team-photo-${member?.id ?? "new"}`}>
            {t("fields.photoUrl")}
          </Label>
          <Input
            id={`team-photo-${member?.id ?? "new"}`}
            name="photoUrl"
            type="url"
            dir="ltr"
            defaultValue={member?.photoUrl}
            placeholder="https://"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`team-specialties-${member?.id ?? "new"}`}>
            {t("fields.specialties")}
          </Label>
          <Input
            id={`team-specialties-${member?.id ?? "new"}`}
            name="specialties"
            defaultValue={member?.specialties.join(", ")}
            placeholder={t("placeholders.specialties")}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`team-bio-${member?.id ?? "new"}`}>
            {t("fields.bio")}
          </Label>
          <Textarea
            id={`team-bio-${member?.id ?? "new"}`}
            name="bio"
            defaultValue={member?.bio}
            maxLength={1000}
            className="min-h-24"
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("fields.branches")}</legend>
        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBranches")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {branches.map((branch) => (
              <Label
                key={branch.id}
                className="flex min-h-10 items-center gap-3 rounded-lg border p-3 font-normal"
              >
                <Checkbox
                  name="branchIds"
                  value={branch.id}
                  defaultChecked={member?.branchIds.includes(branch.id)}
                />
                {branch.name}
              </Label>
            ))}
          </div>
        )}
        {state.fieldErrors?.branchIds ? (
          <p role="alert" className="text-xs text-destructive">
            {state.fieldErrors.branchIds}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus aria-hidden="true" />
          )}
          {pending
            ? common("saving")
            : member
              ? common("saveChanges")
              : t("add")}
        </Button>
      </div>
    </form>
  );
}
