"use client";

import { useActionState } from "react";
import type { BookingStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  proposeBookingChangeAction,
  rescheduleRestaurantReservationAction,
  respondCustomerChangeRequestAction,
  transitionBookingAction,
} from "@/features/business-operations/actions/manage-daily-operations";
import type { DailyOperationActionState } from "@/features/business-operations/actions/manage-daily-operations";

const initialDailyOperationActionState: DailyOperationActionState = {
  status: "idle",
};

export function BusinessBookingProposalForm({
  bookingId,
  contextOrganizationId,
  date,
  expectedBookingVersion,
  idempotencyKey,
  label,
  memberId,
  startsAt,
  supersedeAvailable,
}: {
  bookingId: string;
  contextOrganizationId: string;
  date: string;
  expectedBookingVersion: string;
  idempotencyKey: string;
  label: string;
  memberId: string | null;
  startsAt: string;
  supersedeAvailable: boolean;
}) {
  const [state, action, pending] = useActionState(
    proposeBookingChangeAction.bind(null, bookingId),
    initialDailyOperationActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="expectedBookingVersion" value={expectedBookingVersion} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <input type="hidden" name="memberId" value={memberId ?? ""} />
      <input type="hidden" name="startsAt" value={startsAt} />
      {supersedeAvailable ? (
        <label className="flex items-start gap-2 text-xs">
          <input name="supersedeExistingBusinessProposal" type="checkbox" />
          <span>إلغاء اقتراح النشاط السابق واستبداله بهذا الموعد.</span>
        </label>
      ) : null}
      <Button disabled={pending || state.status === "success"} type="submit" className="w-full">
        {pending ? "جارٍ الإرسال…" : label}
      </Button>
      {state.message ? <p aria-live="polite" className="text-xs">{state.message}</p> : null}
    </form>
  );
}

export function RestaurantReservationRescheduleForm({
  bookingId,
  contextOrganizationId,
  customerNote,
  date,
  expectedBookingVersion,
  expectedReservationVersion,
  guestCount,
  idempotencyKey,
  seatingArea,
  tableId,
  tableOptions,
  time,
}: {
  bookingId: string;
  contextOrganizationId: string;
  customerNote: string | null;
  date: string;
  expectedBookingVersion: string;
  expectedReservationVersion: string;
  guestCount: number;
  idempotencyKey: string;
  seatingArea: string | null;
  tableId: string;
  tableOptions: Array<{ area: string | null; capacity: number; id: string; name: string }>;
  time: string;
}) {
  const [state, action, pending] = useActionState(
    rescheduleRestaurantReservationAction.bind(null, bookingId),
    initialDailyOperationActionState,
  );
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="expectedBookingVersion" value={state.version ?? expectedBookingVersion} />
      <input
        type="hidden"
        name="expectedReservationVersion"
        value={state.reservationVersion ?? expectedReservationVersion}
      />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <div className="grid gap-1">
        <Label htmlFor={`restaurant-date-${bookingId}`}>التاريخ</Label>
        <Input id={`restaurant-date-${bookingId}`} name="date" type="date" defaultValue={date} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`restaurant-time-${bookingId}`}>الوقت المحلي للفرع</Label>
        <Input id={`restaurant-time-${bookingId}`} name="time" type="time" step={1800} defaultValue={time} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`restaurant-guests-${bookingId}`}>عدد الضيوف</Label>
        <Input id={`restaurant-guests-${bookingId}`} name="guestCount" type="number" min={1} max={100} defaultValue={guestCount} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`restaurant-area-${bookingId}`}>منطقة الجلوس</Label>
        <Input id={`restaurant-area-${bookingId}`} name="seatingArea" maxLength={120} defaultValue={seatingArea ?? ""} />
      </div>
      <div className="grid gap-1 md:col-span-2">
        <Label htmlFor={`restaurant-table-${bookingId}`}>الطاولة</Label>
        <select
          id={`restaurant-table-${bookingId}`}
          name="tableId"
          defaultValue={tableId}
          className="h-10 rounded-xl border bg-background px-3 text-sm"
        >
          <option value="">اختيار أصغر طاولة مناسبة تلقائيًا</option>
          {tableOptions.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name} · {table.capacity} {table.area ? `· ${table.area}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1 md:col-span-2">
        <Label htmlFor={`restaurant-note-${bookingId}`}>ملاحظة العميل</Label>
        <Input id={`restaurant-note-${bookingId}`} name="customerNote" maxLength={500} defaultValue={customerNote ?? ""} />
      </div>
      <div className="grid gap-1 md:col-span-2">
        <Button disabled={pending || state.status === "success"} type="submit">
          {pending ? "جارٍ الحفظ…" : "حفظ تعديل الحجز"}
        </Button>
        {state.message ? <p aria-live="polite" className="text-xs">{state.message}</p> : null}
      </div>
    </form>
  );
}

export function BookingTransitionForm({
  bookingId,
  contextOrganizationId,
  expectedVersion,
  idempotencyKey,
  label,
  nextStatus,
}: {
  bookingId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  label: string;
  nextStatus: BookingStatus;
}) {
  const [state, action, pending] = useActionState(
    transitionBookingAction.bind(null, bookingId),
    initialDailyOperationActionState,
  );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      {nextStatus === "CANCELLED" ? (
        <div className="grid gap-1">
          <Label htmlFor={`cancel-${bookingId}`}>سبب الإلغاء الظاهر للعميل</Label>
          <Input
            id={`cancel-${bookingId}`}
            maxLength={500}
            name="cancellationReason"
            required
          />
        </div>
      ) : (
        <input type="hidden" name="cancellationReason" value="" />
      )}
      <Button
        disabled={pending || state.status === "success"}
        size="sm"
        type="submit"
        variant={nextStatus === "CANCELLED" ? "destructive" : "outline"}
      >
        {pending ? "جارٍ الحفظ…" : label}
      </Button>
      {state.message ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function CustomerChangeRequestResponseForm({
  contextOrganizationId,
  decision,
  expectedBookingVersion,
  expectedRequestCreatedAt,
  idempotencyKey,
  label,
  requestId,
}: {
  contextOrganizationId: string;
  decision: "accept" | "reject";
  expectedBookingVersion: string;
  expectedRequestCreatedAt: string;
  idempotencyKey: string;
  label: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(
    respondCustomerChangeRequestAction.bind(null, requestId),
    initialDailyOperationActionState,
  );
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="expectedBookingVersion" value={expectedBookingVersion} />
      <input type="hidden" name="expectedRequestCreatedAt" value={expectedRequestCreatedAt} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <Button disabled={pending || state.status === "success"} size="sm" type="submit" variant="outline">
        {pending ? "جارٍ الحفظ…" : label}
      </Button>
      {state.message ? <p aria-live="polite" className="text-xs">{state.message}</p> : null}
    </form>
  );
}
