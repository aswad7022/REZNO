import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CalendarClock, Mail, Phone, UserRound } from "lucide-react";
import { getFormatter } from "next-intl/server";
import { notFound } from "next/navigation";

import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookingTransitionForm,
  CustomerChangeRequestResponseForm,
} from "@/features/business-operations/components/daily-operation-forms";
import { getOperationalBookingDetail } from "@/features/business-operations/services/booking-operations";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { openBookingConversation } from "@/features/messages/actions/messages";

export async function BusinessBookingDetailPage({ bookingId }: { bookingId: string }) {
  const reference = await currentBusinessOperationReference("BOOKING_READ");
  const [detail, format] = await Promise.all([
    getOperationalBookingDetail(reference, bookingId),
    getFormatter(),
  ]);
  if (!detail) notFound();
  const range = format.dateTimeRange(new Date(detail.startsAt), new Date(detail.endsAt), {
    dateStyle: "medium",
    hour12: true,
    timeStyle: "short",
    timeZone: detail.scope === "STAFF_SELF" ? detail.timezone : detail.branch.timezone,
  });

  if (detail.scope === "STAFF_SELF") {
    return (
      <DashboardShell>
        <DashboardPageHeader
          title={`الحجز ${detail.reference}`}
          description="أجندتك الذاتية للموعد؛ لا تتضمن بيانات اتصال العميل أو أدوات التشغيل."
        />
        <ActiveOrganization name={detail.organizationName} />
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{detail.serviceName}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{range}</p>
            </div>
            <Badge>{detail.status}</Badge>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="العميل" value={detail.customerName} />
            <Info label="الفرع" value={detail.branchName} />
            {detail.notes ? <Info label="ملاحظات تقديم الخدمة" value={detail.notes} /> : null}
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={`الحجز ${detail.reference}`}
        description={`${detail.serviceName} · ${detail.branch.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {detail.scope === "MANAGEMENT" ? (
              <form action={openBookingConversation.bind(null, "business", detail.id)}>
                <Button type="submit" variant="outline">مراسلة العميل</Button>
              </form>
            ) : null}
            {detail.permittedTransitions.length > 0 ? (
              <Button asChild variant="outline">
                <Link href={`/business/bookings/${detail.id}/reschedule`}>اقتراح موعد جديد</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <ActiveOrganization name={detail.organizationName} />
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{detail.serviceName}</CardTitle>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="size-4" /> {range}
              </p>
            </div>
            <Badge>{detail.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="الفرع" value={detail.branch.name} />
              <Info label="الموظف" value={detail.member?.name ?? "تخصيص تلقائي"} />
              <Info label="السعر المحفوظ" value={detail.price} />
              <Info label="المنطقة الزمنية" value={detail.branch.timezone} />
            </div>
            {detail.notes ? <Info label="ملاحظة العميل" value={detail.notes} /> : null}
            {detail.cancellation.reason ? (
              <Info label="سبب الإلغاء الظاهر للعميل" value={detail.cancellation.reason} />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>بيانات العميل التشغيلية</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><UserRound className="size-4" />{detail.customer.name}</p>
            {detail.customer.phone ? <p className="flex items-center gap-2"><Phone className="size-4" />{detail.customer.phone}</p> : null}
            {detail.customer.email ? <p className="flex items-center gap-2"><Mail className="size-4" />{detail.customer.email}</p> : null}
          </CardContent>
        </Card>
      </div>

      {detail.pendingChangeRequest ? (
        <Card>
          <CardHeader><CardTitle>طلب تغيير معلّق</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {detail.pendingChangeRequest.direction === "CUSTOMER_TO_BUSINESS"
                ? "طلب العميل تغيير الموعد."
                : "ينتظر اقتراح النشاط قرار العميل."}
            </p>
            <p className="text-sm text-muted-foreground">
              {format.dateTimeRange(
                new Date(detail.pendingChangeRequest.proposedStartsAt),
                new Date(detail.pendingChangeRequest.proposedEndsAt),
                { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: detail.branch.timezone },
              )}
            </p>
            {detail.pendingChangeRequest.direction === "CUSTOMER_TO_BUSINESS" ? (
              <div className="flex flex-wrap gap-2">
                <CustomerChangeRequestResponseForm
                  contextOrganizationId={reference.contextOrganizationId}
                  decision="accept"
                  expectedBookingVersion={detail.version}
                  expectedRequestCreatedAt={detail.pendingChangeRequest.createdAt}
                  idempotencyKey={randomUUID()}
                  label="قبول الطلب"
                  requestId={detail.pendingChangeRequest.id}
                />
                <CustomerChangeRequestResponseForm
                  contextOrganizationId={reference.contextOrganizationId}
                  decision="reject"
                  expectedBookingVersion={detail.version}
                  expectedRequestCreatedAt={detail.pendingChangeRequest.createdAt}
                  idempotencyKey={randomUUID()}
                  label="رفض الطلب"
                  requestId={detail.pendingChangeRequest.id}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {detail.permittedTransitions.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>إجراءات دورة الحياة</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {detail.permittedTransitions.map((status) => (
              <BookingTransitionForm
                key={status}
                bookingId={detail.id}
                contextOrganizationId={reference.contextOrganizationId}
                expectedVersion={detail.version}
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

function ActiveOrganization({ name }: { name: string }) {
  return <p className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm">النشاط النشط: <strong>{name}</strong></p>;
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
    BUSINESS_CHANGE_PROPOSED: "اقتراح تغيير من النشاط",
    GENERIC_CHANGE_ACCEPTED: "قُبل تغيير الموعد",
    STATUS_CANCELLED: "أُلغي الحجز",
    STATUS_COMPLETED: "اكتمل الحجز",
    STATUS_CONFIRMED: "تأكّد الحجز",
    STATUS_NO_SHOW: "عدم حضور",
    STATUS_PENDING: "الحجز معلّق",
  };
  return labels[event] ?? "حدث تشغيلي";
}
