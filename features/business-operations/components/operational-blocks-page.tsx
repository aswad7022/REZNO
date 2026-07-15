"use client";

import { useActionState } from "react";
import { CalendarOff, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createBlock,
  deleteBlock,
  updateBlock,
} from "@/features/business-operations/actions/manage-blocks";
import {
  initialOperationalBlockActionState,
  type OperationalBlockView,
  type OperationalBlocksView,
} from "@/features/business-operations/types/blocks";

function localInputValue(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function Impact({ details }: { details?: Record<string, boolean | number | string | null> }) {
  const t = useTranslations("OperationalBlocks");
  return details?.total ? (
    <p className="text-xs text-amber-700">
      {t("impact", {
        generic: Number(details.genericBookings ?? 0),
        restaurant: Number(details.restaurantReservations ?? 0),
      })}
    </p>
  ) : null;
}

function BlockFields({ block, timezone }: { block?: OperationalBlockView; timezone: string }) {
  const t = useTranslations("OperationalBlocks");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`startsAt-${block?.id ?? "new"}`}>{t("startsAt")}</Label>
        <Input
          id={`startsAt-${block?.id ?? "new"}`}
          name="startsAt"
          type="datetime-local"
          defaultValue={block ? localInputValue(block.startsAt, timezone) : undefined}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`endsAt-${block?.id ?? "new"}`}>{t("endsAt")}</Label>
        <Input
          id={`endsAt-${block?.id ?? "new"}`}
          name="endsAt"
          type="datetime-local"
          defaultValue={block ? localInputValue(block.endsAt, timezone) : undefined}
          required
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`reason-${block?.id ?? "new"}`}>{t("reason")}</Label>
        <Textarea
          id={`reason-${block?.id ?? "new"}`}
          name="reason"
          defaultValue={block?.reason ?? ""}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">{t("reasonPrivate")}</p>
      </div>
    </div>
  );
}

function Confirmation({ id }: { id: string }) {
  const t = useTranslations("OperationalBlocks");
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 p-3">
      <Checkbox id={id} name="confirmFutureReservations" />
      <Label htmlFor={id} className="text-xs leading-5">
        {t("confirmFutureReservations")}
      </Label>
    </div>
  );
}

function ExistingBlock({ block, data }: { block: OperationalBlockView; data: OperationalBlocksView }) {
  const t = useTranslations("OperationalBlocks");
  const common = useTranslations("Common");
  const [updateState, updateAction, updating] = useActionState(
    updateBlock.bind(null, data.branchId, block.id),
    initialOperationalBlockActionState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteBlock.bind(null, data.branchId, block.id),
    initialOperationalBlockActionState,
  );
  if (block.historical) {
    return (
      <Card className="opacity-75">
        <CardHeader><CardTitle className="text-base">{t("historical")}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).formatRange(new Date(block.startsAt), new Date(block.endsAt))}
          {block.reason ? <p className="mt-2">{block.reason}</p> : null}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("scheduled")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form action={updateAction} className="space-y-4">
          <input type="hidden" name="contextOrganizationId" value={data.organizationId} />
          <input type="hidden" name="expectedVersion" value={updateState.version ?? block.version} />
          <input type="hidden" name="idempotencyKey" value={updateState.nextIdempotencyKey ?? block.updateIdempotencyKey} />
          <BlockFields block={block} timezone={data.timezone} />
          <Confirmation id={`confirm-update-${block.id}`} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={updating || deleting}>
              {updating ? <LoaderCircle className="animate-spin" /> : <Save />}
              {common("saveChanges")}
            </Button>
            {updateState.message ? <p role="status" className={updateState.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{updateState.message}</p> : null}
          </div>
          <Impact details={updateState.details} />
        </form>
        <form action={deleteAction} className="flex flex-wrap items-center gap-3 border-t pt-4">
          <input type="hidden" name="contextOrganizationId" value={data.organizationId} />
          <input type="hidden" name="expectedVersion" value={block.version} />
          <input type="hidden" name="idempotencyKey" value={deleteState.nextIdempotencyKey ?? block.deleteIdempotencyKey} />
          <Button type="submit" size="sm" variant="destructive" disabled={updating || deleting}>
            {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            {t("remove")}
          </Button>
          {deleteState.message ? <p role="status" className={deleteState.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{deleteState.message}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function OperationalBlocksPage({ data }: { data: OperationalBlocksView }) {
  const t = useTranslations("OperationalBlocks");
  const [state, action, pending] = useActionState(
    createBlock.bind(null, data.branchId),
    initialOperationalBlockActionState,
  );
  return (
    <div className="space-y-5">
      <Card className="shadow-none"><CardContent className="pt-6 text-sm"><span className="text-muted-foreground">{t("activeBusiness")}:</span> <strong>{data.organizationName}</strong> · <span dir="ltr">{data.timezone}</span></CardContent></Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="size-5" />{t("add")}</CardTitle></CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <input type="hidden" name="contextOrganizationId" value={data.organizationId} />
            <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? data.createIdempotencyKey} />
            <BlockFields timezone={data.timezone} />
            <Confirmation id="confirm-create-block" />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : <CalendarOff />}
                {t("add")}
              </Button>
              {state.message ? <p role="status" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{state.message}</p> : null}
            </div>
            <Impact details={state.details} />
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4">
        {data.blocks.length ? data.blocks.map((block) => <ExistingBlock key={block.id} block={block} data={data} />) : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</CardContent></Card>}
      </div>
    </div>
  );
}
