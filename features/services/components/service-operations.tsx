"use client";

import { useActionState } from "react";
import { Archive, LoaderCircle, Minus, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { archiveService, setServiceActive } from "@/features/services/actions/create-service";
import {
  addServiceAssignment,
  createOffering,
  removeOffering,
  removeServiceAssignment,
  updateOffering,
} from "@/features/services/actions/manage-offerings";
import {
  initialServiceActionState,
  type ServiceDetails,
} from "@/features/services/types";

function Feedback({ replayedLabel, state }: { replayedLabel: string; state: typeof initialServiceActionState }) {
  return state.message || state.replayed ? (
    <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
      {state.message}{state.replayed ? ` · ${replayedLabel}` : ""}
    </p>
  ) : null;
}

function ServiceLifecycle({ idempotencyKey, organizationId, service }: {
  idempotencyKey: string;
  organizationId: string;
  service: ServiceDetails;
}) {
  const t = useTranslations("Services.operations");
  const action = setServiceActive.bind(null, service.id, service.status !== "ACTIVE");
  const [state, formAction, pending] = useActionState(action, initialServiceActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? service.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      {service.status === "ACTIVE" ? (
        <Label className="flex items-center gap-2 font-normal"><Checkbox name="confirmFutureBookings" />{t("confirmImpact")}</Label>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending || service.status === "ARCHIVED"}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
        {service.status === "ACTIVE" ? t("deactivate") : t("activate")}
      </Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

function ServiceArchive({ idempotencyKey, organizationId, service }: {
  idempotencyKey: string;
  organizationId: string;
  service: ServiceDetails;
}) {
  const t = useTranslations("Services.operations");
  const [state, formAction, pending] = useActionState(archiveService.bind(null, service.id), initialServiceActionState);
  if (service.status !== "INACTIVE") return null;
  return (
    <form action={formAction} className="flex items-center gap-3 rounded-lg border p-3">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? service.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Archive />}{t("archive")}
      </Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

function OfferingCreate({ branches, idempotencyKey, organizationId, serviceId }: {
  branches: Array<{ id: string; name: string }>;
  idempotencyKey: string;
  organizationId: string;
  serviceId: string;
}) {
  const t = useTranslations("Services.operations");
  const [state, formAction, pending] = useActionState(createOffering.bind(null, serviceId), initialServiceActionState);
  if (branches.length === 0) return null;
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-3 md:grid-cols-4 md:items-end">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <div className="space-y-1"><Label>{t("branch")}</Label><Select name="branchId" defaultValue={branches[0]?.id}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{t("price")}</Label><Input name="price" inputMode="decimal" dir="ltr" defaultValue="10.00" required /></div>
      <div className="space-y-1"><Label>{t("duration")}</Label><Input name="durationMinutes" type="number" min="5" max="1440" step="1" dir="ltr" defaultValue="30" required /><input type="hidden" name="pricingType" value="FIXED" /></div>
      <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{t("addOffering")}</Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

function OfferingEdit({ idempotencyKey, offering, organizationId }: {
  idempotencyKey: string;
  offering: ServiceDetails["offerings"][number];
  organizationId: string;
}) {
  const t = useTranslations("Services.operations");
  const [state, formAction, pending] = useActionState(updateOffering.bind(null, offering.id), initialServiceActionState);
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-3 md:grid-cols-5 md:items-end">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? offering.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <div className="font-medium">{offering.branchName}</div>
      <div className="space-y-1"><Label>{t("price")}</Label><Input name="price" inputMode="decimal" dir="ltr" defaultValue={offering.price} required /></div>
      <div className="space-y-1"><Label>{t("duration")}</Label><Input name="durationMinutes" type="number" min="5" max="1440" step="1" dir="ltr" defaultValue={offering.durationMinutes} required /></div>
      <div className="space-y-2"><input type="hidden" name="pricingType" value={offering.pricingType} /><Label className="flex items-center gap-2 font-normal"><Checkbox name="isAvailable" defaultChecked={offering.isAvailable} />{t("available")}</Label><Label className="flex items-center gap-2 font-normal"><Checkbox name="confirmFutureBookings" />{t("confirmImpact")}</Label></div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}{t("save")}</Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

function OfferingRemove({ idempotencyKey, offering, organizationId }: {
  idempotencyKey: string;
  offering: ServiceDetails["offerings"][number];
  organizationId: string;
}) {
  const t = useTranslations("Services.operations");
  const [state, formAction, pending] = useActionState(removeOffering.bind(null, offering.id), initialServiceActionState);
  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={offering.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Minus />}{t("removeUnusedOffering")}</Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

function AssignmentAdd({ idempotencyKey, members, organizationId, serviceId }: {
  idempotencyKey: string;
  members: Array<{ id: string; name: string }>;
  organizationId: string;
  serviceId: string;
}) {
  const t = useTranslations("Services.operations");
  const [state, formAction, pending] = useActionState(addServiceAssignment.bind(null, serviceId), initialServiceActionState);
  if (members.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <div className="min-w-56 space-y-1"><Label>{t("employee")}</Label><Select name="memberId" defaultValue={members[0]?.id}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{t("assignEmployee")}</Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

function AssignmentRemove({ assignment, idempotencyKey, memberName, organizationId }: {
  assignment: ServiceDetails["staffAssignments"][number];
  idempotencyKey: string;
  memberName: string;
  organizationId: string;
}) {
  const t = useTranslations("Services.operations");
  const [state, formAction, pending] = useActionState(removeServiceAssignment.bind(null, assignment.id), initialServiceActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={assignment.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <span className="text-sm font-medium">{memberName}</span>
      <Label className="flex items-center gap-2 font-normal"><Checkbox name="confirmFutureBookings" />{t("confirmImpact")}</Label>
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Minus />}{t("remove")}</Button>
      <Feedback replayedLabel={t("replayed")} state={state} />
    </form>
  );
}

export type ServiceOperationKeys = {
  archive: string;
  assignmentAdd: string;
  assignmentRemove: Record<string, string>;
  lifecycle: string;
  offeringCreate: string;
  offeringRemove: Record<string, string>;
  offeringUpdate: Record<string, string>;
};

export function ServiceOperations({ branches, keys, members, organizationId, service }: {
  branches: Array<{ id: string; name: string }>;
  keys: ServiceOperationKeys;
  members: Array<{ id: string; name: string }>;
  organizationId: string;
  service: ServiceDetails;
}) {
  const t = useTranslations("Services");
  const existingBranches = new Set(service.offerings.map((offering) => offering.branchId));
  const assigned = new Set(service.assignedMemberIds);
  const memberNames = new Map(members.map((member) => [member.id, member.name]));
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">{t("operations.title")}</summary>
      <div className="mt-4 space-y-4 border-t pt-4">
        <ServiceLifecycle idempotencyKey={keys.lifecycle} organizationId={organizationId} service={service} />
        <ServiceArchive idempotencyKey={keys.archive} organizationId={organizationId} service={service} />
        <h4 className="font-medium">{t("operations.offerings")}</h4>
        {service.offerings.map((offering) => <div key={offering.id} className="space-y-1"><OfferingEdit idempotencyKey={keys.offeringUpdate[offering.id]!} offering={offering} organizationId={organizationId} /><OfferingRemove idempotencyKey={keys.offeringRemove[offering.id]!} offering={offering} organizationId={organizationId} /></div>)}
        <OfferingCreate branches={branches.filter((branch) => !existingBranches.has(branch.id))} idempotencyKey={keys.offeringCreate} organizationId={organizationId} serviceId={service.id} />
        <h4 className="font-medium">{t("operations.staffAssignments")}</h4>
        {service.staffAssignments.map((assignment) => <AssignmentRemove key={assignment.id} assignment={assignment} idempotencyKey={keys.assignmentRemove[assignment.id]!} memberName={memberNames.get(assignment.memberId) ?? t("operations.employee")} organizationId={organizationId} />)}
        <AssignmentAdd idempotencyKey={keys.assignmentAdd} members={members.filter((member) => !assigned.has(member.id))} organizationId={organizationId} serviceId={service.id} />
      </div>
    </details>
  );
}
