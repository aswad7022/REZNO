"use client";

import { useActionState } from "react";
import type { SystemRole } from "@prisma/client";
import { LoaderCircle, Minus, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addBranchAssignment,
  removeBranchAssignment,
  removeMember,
  revokeInvitation,
  setMemberActive,
  updateMemberRole,
} from "@/features/team/actions/manage-team-member";
import {
  initialTeamMemberActionState,
  type TeamInvitationDetails,
  type TeamMemberDetails,
} from "@/features/team/types";

function Feedback({ replayedLabel, state }: { replayedLabel: string; state: typeof initialTeamMemberActionState }) {
  return state.message || state.replayed ? <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{state.message}{state.replayed ? ` · ${replayedLabel}` : ""}</p> : null;
}

function RoleControl({ actorRole, idempotencyKey, member, organizationId }: { actorRole: SystemRole; idempotencyKey: string; member: TeamMemberDetails; organizationId: string }) {
  const t = useTranslations("Team");
  const [state, formAction, pending] = useActionState(updateMemberRole.bind(null, member.id), initialTeamMemberActionState);
  return <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-3"><input type="hidden" name="contextOrganizationId" value={organizationId} /><input type="hidden" name="expectedVersion" value={state.version ?? member.version} /><input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} /><div className="min-w-48 space-y-1"><Label>{t("operations.role")}</Label><Select name="systemRole" defaultValue={member.systemRole === "OWNER" || !member.systemRole ? "STAFF" : member.systemRole}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{actorRole === "OWNER" ? <SelectItem value="MANAGER">{t("roles.MANAGER")}</SelectItem> : null}<SelectItem value="RECEPTIONIST">{t("roles.RECEPTIONIST")}</SelectItem><SelectItem value="STAFF">{t("roles.STAFF")}</SelectItem></SelectContent></Select></div><Button type="submit" size="sm" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}{t("operations.updateRole")}</Button><Feedback replayedLabel={t("replayed")} state={state} /></form>;
}

function LifecycleControl({ idempotencyKey, member, organizationId }: { idempotencyKey: string; member: TeamMemberDetails; organizationId: string }) {
  const t = useTranslations("Team");
  const active = member.status !== "ACTIVE";
  const [state, formAction, pending] = useActionState(setMemberActive.bind(null, member.id, active), initialTeamMemberActionState);
  return <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><input type="hidden" name="contextOrganizationId" value={organizationId} /><input type="hidden" name="expectedVersion" value={state.version ?? member.version} /><input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />{!active ? <Label className="flex items-center gap-2 font-normal"><Checkbox name="confirmFutureBookings" />{t("operations.confirmImpact")}</Label> : null}<Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}{active ? t("operations.activate") : t("operations.deactivate")}</Button><Feedback replayedLabel={t("replayed")} state={state} /></form>;
}

function RemoveMemberControl({ idempotencyKey, member, organizationId }: { idempotencyKey: string; member: TeamMemberDetails; organizationId: string }) {
  const t = useTranslations("Team");
  const [state, formAction, pending] = useActionState(removeMember.bind(null, member.id), initialTeamMemberActionState);
  return <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><input type="hidden" name="contextOrganizationId" value={organizationId} /><input type="hidden" name="expectedVersion" value={member.version} /><input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} /><Label className="flex items-center gap-2 font-normal"><Checkbox name="confirmFutureBookings" />{t("operations.confirmImpact")}</Label><Button type="submit" size="sm" variant="destructive" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{t("operations.removeMember")}</Button><Feedback replayedLabel={t("replayed")} state={state} /></form>;
}

function BranchAdd({ branches, idempotencyKey, member, organizationId }: { branches: Array<{ id: string; name: string }>; idempotencyKey: string; member: TeamMemberDetails; organizationId: string }) {
  const t = useTranslations("Team");
  const [state, formAction, pending] = useActionState(addBranchAssignment.bind(null, member.id), initialTeamMemberActionState);
  if (!branches.length || member.status !== "ACTIVE") return null;
  return <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-3"><input type="hidden" name="contextOrganizationId" value={organizationId} /><input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} /><div className="min-w-48 space-y-1"><Label>{t("operations.branch")}</Label><Select name="branchId" defaultValue={branches[0]?.id}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div><Button type="submit" size="sm" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{t("operations.assignBranch")}</Button><Feedback replayedLabel={t("replayed")} state={state} /></form>;
}

function BranchRemove({ assignment, branchName, idempotencyKey, organizationId }: { assignment: TeamMemberDetails["assignments"][number]; branchName: string; idempotencyKey: string; organizationId: string }) {
  const t = useTranslations("Team");
  const [state, formAction, pending] = useActionState(removeBranchAssignment.bind(null, assignment.id), initialTeamMemberActionState);
  return <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><input type="hidden" name="contextOrganizationId" value={organizationId} /><input type="hidden" name="expectedVersion" value={assignment.version} /><input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} /><span className="text-sm font-medium">{branchName}</span><Label className="flex items-center gap-2 font-normal"><Checkbox name="confirmFutureBookings" />{t("operations.confirmImpact")}</Label><Button type="submit" size="sm" variant="ghost" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Minus />}{t("operations.remove")}</Button><Feedback replayedLabel={t("replayed")} state={state} /></form>;
}

export type TeamOperationKeys = { branchAdd: string; branchRemove: Record<string, string>; lifecycle: string; remove: string; role: string };

export function TeamOperations({ actorRole, branches, keys, member, organizationId }: { actorRole: SystemRole; branches: Array<{ id: string; name: string }>; keys: TeamOperationKeys; member: TeamMemberDetails; organizationId: string }) {
  const t = useTranslations("Team");
  const assigned = new Set(member.branchIds);
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  return <div className="space-y-3"><RoleControl actorRole={actorRole} idempotencyKey={keys.role} member={member} organizationId={organizationId} /><LifecycleControl idempotencyKey={keys.lifecycle} member={member} organizationId={organizationId} />{member.status !== "ARCHIVED" ? <RemoveMemberControl idempotencyKey={keys.remove} member={member} organizationId={organizationId} /> : null}<h4 className="font-medium">{t("operations.branchAssignments")}</h4>{member.assignments.map((assignment) => <BranchRemove key={assignment.id} assignment={assignment} branchName={branchNames.get(assignment.branchId) ?? t("operations.branch")} idempotencyKey={keys.branchRemove[assignment.id]!} organizationId={organizationId} />)}<BranchAdd branches={branches.filter((branch) => !assigned.has(branch.id))} idempotencyKey={keys.branchAdd} member={member} organizationId={organizationId} />{member.serviceAssignments.length ? <div className="rounded-lg border p-3 text-sm"><strong>{t("operations.assignedServices")}</strong> {member.serviceAssignments.map((assignment) => assignment.serviceName).join(" · ")}</div> : null}</div>;
}

export function InvitationRevoke({ idempotencyKey, invitation, organizationId }: { idempotencyKey: string; invitation: TeamInvitationDetails; organizationId: string }) {
  const t = useTranslations("Team");
  const [state, formAction, pending] = useActionState(revokeInvitation.bind(null, invitation.id), initialTeamMemberActionState);
  return <form action={formAction} className="flex items-center gap-2"><input type="hidden" name="contextOrganizationId" value={organizationId} /><input type="hidden" name="expectedVersion" value={invitation.version} /><input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} /><Button type="submit" size="sm" variant="ghost" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{t("operations.revoke")}</Button><Feedback replayedLabel={t("replayed")} state={state} /></form>;
}
