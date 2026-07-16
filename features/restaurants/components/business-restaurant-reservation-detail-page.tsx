import { randomUUID } from "node:crypto";
import { CalendarClock, Mail, Phone, UsersRound, Utensils } from "lucide-react";
import { getFormatter } from "next-intl/server";
import { notFound } from "next/navigation";

import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookingTransitionForm,
  RestaurantReservationRescheduleForm,
} from "@/features/business-operations/components/daily-operation-forms";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { getOperationalRestaurantReservationDetail } from "@/features/business-operations/services/restaurant-operations";
import { openBookingConversation } from "@/features/messages/actions/messages";

export async function BusinessRestaurantReservationDetailPage({
  bookingId,
}: {
  bookingId: string;
}) {
  const reference = await currentBusinessOperationReference(
    "RESTAURANT_RESERVATION_OPERATE",
  );
  const [detail, format] = await Promise.all([
    getOperationalRestaurantReservationDetail(reference, bookingId),
    getFormatter(),
  ]);
  if (!detail) notFound();
  const startsAt = new Date(detail.startsAt);
  const localDate = dateInTimezone(startsAt, detail.branch.timezone);
  const localTime = timeInTimezone(startsAt, detail.branch.timezone);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={`حجز المطعم ${detail.reference}`}
        description={`${detail.branch.name} · ${format.dateTimeRange(
          startsAt,
          new Date(detail.endsAt),
          { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: detail.branch.timezone },
        )}`}
        actions={
          detail.scope === "MANAGEMENT" ? (
            <form action={openBookingConversation.bind(null, "business", detail.id)}>
              <Button type="submit" variant="outline">مراسلة العميل</Button>
            </form>
          ) : null
        }
      />
      <p className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm">
        النشاط النشط: <strong>{detail.organizationName}</strong> · الفرع: <strong>{detail.branch.name}</strong>
      </p>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><CalendarClock className="size-5" />تفاصيل الحجز</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{detail.branch.timezone}</p>
            </div>
            <Badge>{detail.status}</Badge>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Info label="الضيوف" value={`${detail.guestCount}`} />
            <Info label="الطاولة" value={`${detail.table.name} · ${detail.table.capacity}`} />
            <Info label="منطقة الجلوس" value={detail.seatingArea ?? "—"} />
            <Info label="ملاحظة العميل" value={detail.customerNote ?? "—"} />
            {detail.cancellation.reason ? (
              <Info label="سبب الإلغاء الظاهر للعميل" value={detail.cancellation.reason} />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>بيانات العميل التشغيلية</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><UsersRound className="size-4" />{detail.customer.name}</p>
            {detail.customer.phone ? <p className="flex items-center gap-2"><Phone className="size-4" />{detail.customer.phone}</p> : null}
            {detail.customer.email ? <p className="flex items-center gap-2"><Mail className="size-4" />{detail.customer.email}</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Utensils className="size-5" />لقطات الطلب المسبق</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {detail.preorder.length ? detail.preorder.map((item) => (
            <p key={item.id} className="rounded-xl border p-3 text-sm">
              {item.quantity}× {item.name} · {item.unitPrice} {item.currency}
              {item.note ? <span className="block text-muted-foreground">{item.note}</span> : null}
            </p>
          )) : <p className="text-sm text-muted-foreground">لا يوجد طلب مسبق.</p>}
        </CardContent>
      </Card>

      {detail.status === "PENDING" || detail.status === "CONFIRMED" ? (
        <Card>
          <CardHeader>
            <CardTitle>تعديل الموعد أو الطاولة</CardTitle>
            <p className="text-sm text-muted-foreground">
              تُفحص ساعات الفرع والحجب والسعة والتعارضات داخل معاملة تسلسلية قبل الحفظ.
            </p>
          </CardHeader>
          <CardContent>
            <RestaurantReservationRescheduleForm
              bookingId={detail.id}
              contextOrganizationId={reference.contextOrganizationId}
              customerNote={detail.customerNote}
              date={localDate}
              expectedBookingVersion={detail.bookingVersion}
              expectedReservationVersion={detail.reservationVersion}
              guestCount={detail.guestCount}
              idempotencyKey={randomUUID()}
              seatingArea={detail.seatingArea}
              tableId={detail.table.id}
              tableOptions={detail.tableOptions}
              time={localTime}
            />
          </CardContent>
        </Card>
      ) : null}

      {detail.permittedTransitions.length ? (
        <Card>
          <CardHeader><CardTitle>إجراءات دورة الحياة</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {detail.permittedTransitions.map((status) => (
              <BookingTransitionForm
                key={status}
                bookingId={detail.id}
                contextOrganizationId={reference.contextOrganizationId}
                expectedVersion={detail.bookingVersion}
                idempotencyKey={randomUUID()}
                label={transitionLabel(status)}
                nextStatus={status}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>السجل التشغيلي الآمن</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {detail.activity.length ? detail.activity.map((entry) => (
            <p key={entry.id} className="rounded-xl border p-3 text-sm">
              {activityLabel(entry.event)} · {format.dateTime(new Date(entry.createdAt), { dateStyle: "medium", timeStyle: "short", timeZone: detail.branch.timezone })}
            </p>
          )) : <p className="text-sm text-muted-foreground">لا توجد أحداث تشغيلية مصنّفة بعد.</p>}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

function dateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timeInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="rounded-xl bg-muted/40 p-3 text-sm"><span className="text-muted-foreground">{label}: </span>{value}</p>;
}

function transitionLabel(status: string) {
  if (status === "CONFIRMED") return "تأكيد الحجز";
  if (status === "CANCELLED") return "إلغاء الحجز";
  if (status === "COMPLETED") return "تحديد كمكتمل";
  return "تحديد كعدم حضور";
}

function activityLabel(event: string) {
  const labels: Record<string, string> = {
    RESTAURANT_RESCHEDULED: "تعديل حجز المطعم",
    TABLE_REASSIGNED: "إعادة تخصيص الطاولة",
    STATUS_CANCELLED: "إلغاء الحجز",
    STATUS_COMPLETED: "اكتمال الحجز",
    STATUS_CONFIRMED: "تأكيد الحجز",
    STATUS_NO_SHOW: "عدم حضور",
    STATUS_PENDING: "حجز معلّق",
  };
  return labels[event] ?? "حدث تشغيلي";
}
