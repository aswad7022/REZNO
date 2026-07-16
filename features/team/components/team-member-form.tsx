"use client";

import { useActionState } from "react";
import type { SystemRole } from "@prisma/client";
import { LoaderCircle, Save, UserPlus } from "lucide-react";
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
import { addTeamMember, updateTeamMember } from "@/features/team/actions/manage-team-member";
import {
  initialTeamMemberActionState,
  type TeamMemberDetails,
} from "@/features/team/types";

export function TeamMemberForm({
  actorRole,
  defaultExpiresAt,
  idempotencyKey,
  member,
  organizationId,
}: {
  actorRole: SystemRole;
  defaultExpiresAt?: string;
  idempotencyKey: string;
  member?: TeamMemberDetails;
  organizationId: string;
}) {
  const t = useTranslations("Team");
  const common = useTranslations("Common");
  const [state, formAction, pending] = useActionState(
    member ? updateTeamMember.bind(null, member.id) : addTeamMember,
    initialTeamMemberActionState,
  );
  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      {member ? <input type="hidden" name="expectedVersion" value={state.version ?? member.version} /> : null}
      {!member ? (
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="team-email">{t("fields.email")}</Label><Input id="team-email" name="email" type="email" dir="ltr" required /></div>
          <div className="space-y-2"><Label htmlFor="team-role-new">{t("fields.role")}</Label><Select name="systemRole" defaultValue="STAFF"><SelectTrigger id="team-role-new" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{actorRole === "OWNER" ? <SelectItem value="MANAGER">{t("roles.MANAGER")}</SelectItem> : null}<SelectItem value="RECEPTIONIST">{t("roles.RECEPTIONIST")}</SelectItem><SelectItem value="STAFF">{t("roles.STAFF")}</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="team-expires">{t("fields.expiresAt")}</Label><Input id="team-expires" name="expiresAt" type="datetime-local" dir="ltr" defaultValue={defaultExpiresAt} required /></div>
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`team-photo-${member.id}`}>{t("fields.photoUrl")}</Label><Input id={`team-photo-${member.id}`} name="photoUrl" type="url" dir="ltr" defaultValue={member.photoUrl} placeholder="https://" /></div>
            <div className="space-y-2"><Label htmlFor={`team-specialties-${member.id}`}>{t("fields.specialties")}</Label><Input id={`team-specialties-${member.id}`} name="specialties" defaultValue={member.specialties.join(", ")} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor={`team-bio-${member.id}`}>{t("fields.bio")}</Label><Textarea id={`team-bio-${member.id}`} name="bio" defaultValue={member.bio} maxLength={1000} /></div>
            <Label className="flex min-h-11 items-center gap-3 rounded-lg border p-3 font-normal"><Checkbox name="isPublicProfessional" defaultChecked={member.isPublicProfessional} />{t("fields.publicProfileEnabled")}</Label>
            <div className="space-y-2"><Label htmlFor={`team-public-slug-${member.id}`}>{t("fields.publicSlug")}</Label><Input id={`team-public-slug-${member.id}`} name="publicSlug" dir="ltr" defaultValue={member.publicSlug} placeholder="staff-name" /></div>
          </div>
        </>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{state.message}{state.replayed ? ` · ${t("replayed")}` : ""}</p>
        <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : member ? <Save /> : <UserPlus />}{pending ? common("saving") : member ? common("saveChanges") : t("sendInvitation")}</Button>
      </div>
    </form>
  );
}
