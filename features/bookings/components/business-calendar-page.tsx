import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  UsersRound,
  Utensils,
  XCircle,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import {
  type BookingStatus,
} from "@prisma/client";
import { BookingTransitionForm } from "@/features/business-operations/components/daily-operation-forms";
import { listOperationalCustomerChangeRequests } from "@/features/business-operations/services/booking-operations";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { getBusinessCalendarData } from "@/features/bookings/services/business-calendar";
import type {
  BusinessCalendarBookingItem,
  BusinessCalendarSearchParams,
  StaffSelfCalendarBookingItem,
} from "@/features/bookings/services/business-calendar";
import { openBookingConversation } from "@/features/messages/actions/messages";

const statusValues = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;

function buildCalendarHref(
  params: BusinessCalendarSearchParams,
  updates: BusinessCalendarSearchParams,
) {
  const query = new URLSearchParams();
  const merged = { ...params, ...updates };
  if (!("cursor" in updates)) delete merged.cursor;
  for (const [key, value] of Object.entries(merged)) {
    if (value && value !== "all") query.set(key, value);
  }
  const queryString = query.toString();
  return queryString ? `/business/calendar?${queryString}` : "/business/calendar";
}

export async function BusinessCalendarPage({
  searchParams,
}: {
  searchParams: BusinessCalendarSearchParams;
}) {
  const [data, t, bookingsT, format] = await Promise.all([
    getBusinessCalendarData(searchParams),
    getTranslations("BusinessCalendar"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);

  const summaryCards = data.summary ? [
    {
      label: t("totalBookings"),
      value: data.summary.total,
      icon: CalendarDays,
    },
    { label: t("pending"), value: data.summary.pending, icon: Clock3 },
    {
      label: t("confirmed"),
      value: data.summary.confirmed,
      icon: CheckCircle2,
    },
    {
      label: t("completed"),
      value: data.summary.completed,
      icon: CheckCircle2,
    },
    {
      label: t("cancelled"),
      value: data.summary.cancelled,
      icon: XCircle,
    },
    {
      label: t("restaurantReservations"),
      value: data.summary.restaurantReservations,
      icon: Utensils,
    },
  ] : [];
  const pendingCustomerRequests = data.scope === "STAFF_SELF"
    ? []
    : await listOperationalCustomerChangeRequests(
        await currentBusinessOperationReference("BOOKING_CHANGE_REQUEST_READ"),
      );

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
      />

      <p className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm">
        النشاط النشط: <strong>{data.organizationName}</strong> · نطاق الدور: <strong>{data.scope}</strong>
      </p>

      {pendingCustomerRequests.length > 0 ? (
        <section aria-labelledby="pending-customer-requests" className="space-y-3">
          <h2 id="pending-customer-requests" className="text-lg font-semibold">
            طلبات تغيير العملاء المعلّقة
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {pendingCustomerRequests.map((request) => (
              <Card key={request.id} className="border-indigo-300/40">
                <CardContent className="space-y-2 p-4 text-sm">
                  <p className="font-semibold">{request.customerName} · {request.serviceName}</p>
                  <p className="text-muted-foreground">{request.branchName}</p>
                  <p>
                    {format.dateTimeRange(
                      new Date(request.proposedStartsAt),
                      new Date(request.proposedEndsAt),
                      { dateStyle: "medium", timeStyle: "short", timeZone: request.timezone },
                    )}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/business/bookings/${request.bookingId}`}>فتح الطلب ومعالجته</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="daily-summary" className="space-y-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-primary/10 bg-gradient-to-l from-primary/10 via-indigo-500/5 to-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="daily-summary" className="text-lg font-semibold">
              {t("dailySummary")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("selectedDate", {
                date: format.dateTime(new Date(`${data.selectedDate}T00:00:00Z`), {
                  dateStyle: "full",
                  timeZone: "UTC",
                }),
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={buildCalendarHref(searchParams, {
                  date: data.previousDate,
                  view: "today",
                })}
              >
                <ChevronRight className="size-4 rtl:rotate-180" />
                {t("previousDay")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={buildCalendarHref(searchParams, { date: undefined, view: "today" })}>
                {t("today")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                href={buildCalendarHref(searchParams, {
                  date: data.nextDate,
                  view: "today",
                })}
              >
                {t("nextDay")}
                <ChevronLeft className="size-4 rtl:rotate-180" />
              </Link>
            </Button>
          </div>
        </div>

        {data.summary ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((item) => (
            <Card key={item.label} className="border-primary/10">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold">{item.value}</p>
                </div>
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
              </CardContent>
            </Card>
            ))}
          </div>
        ) : null}
      </section>

      {data.scope !== "STAFF_SELF" ? (
        <Card className="mt-6 border-primary/10">
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <input type="hidden" name="view" value={data.view} />
            <FilterField label={t("selectedDateLabel")}>
              <input
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                defaultValue={data.selectedDate}
                name="date"
                type="date"
              />
            </FilterField>
            <FilterField label={t("filterByBranch")}>
              <NativeSelect name="branchId" defaultValue={data.filters.branchId}>
                <option value="">{t("allBranches")}</option>
                {data.options.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterField>
            <FilterField label={t("filterByEmployee")}>
              <NativeSelect name="memberId" defaultValue={data.filters.memberId}>
                <option value="">{t("allEmployees")}</option>
                {data.options.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterField>
            <FilterField label={t("filterByService")}>
              <NativeSelect name="serviceId" defaultValue={data.filters.serviceId}>
                <option value="">{t("allServices")}</option>
                {data.options.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterField>
            <FilterField label={t("filterByStatus")}>
              <NativeSelect name="status" defaultValue={data.filters.status}>
                <option value="all">{t("allStatuses")}</option>
                {statusValues.map((status) => (
                  <option key={status} value={status}>
                    {bookingsT(`statuses.${status}`)}
                  </option>
                ))}
              </NativeSelect>
            </FilterField>
            <FilterField label={t("bookingType")}>
              <NativeSelect name="type" defaultValue={data.filters.type}>
                <option value="all">{t("allTypes")}</option>
                <option value="service">{t("serviceBooking")}</option>
                <option value="restaurant">{t("tableReservation")}</option>
              </NativeSelect>
            </FilterField>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                {t("applyFilters")}
              </Button>
            </div>
          </form>
        </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2" aria-label={t("views")}>
        {[
          ["today", t("todayView")],
          ["upcoming", t("upcomingBookings")],
          ["past", t("pastBookings")],
          ["cancelled", t("cancelledBookings")],
        ].map(([view, label]) => (
          <Button
            key={view}
            asChild
            size="sm"
            variant={data.view === view ? "default" : "outline"}
          >
            <Link href={buildCalendarHref(searchParams, { view })}>{label}</Link>
          </Button>
        ))}
      </div>

      <section className="mt-6">
        {data.bookings.length === 0 ? (
          <DashboardEmpty
            icon={CalendarDays}
            title={t("noBookingsForThisDay")}
            description={t("noBookingsDescription")}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.scope === "STAFF_SELF"
              ? data.bookings.map((booking) => (
                  <StaffCalendarBookingCard key={booking.id} booking={booking} />
                ))
              : data.bookings.map((booking) => (
                  <BusinessCalendarBookingCard
                    key={booking.id}
                    booking={booking}
                    canMessage={data.scope === "MANAGEMENT"}
                    organizationId={data.organizationId}
                  />
                ))}
          </div>
        )}
      </section>
      {data.nextCursor ? (
        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline">
            <Link
              href={buildCalendarHref(searchParams, {
                cursor: data.nextCursor,
                date: data.selectedDate,
                view: data.view,
              })}
            >
              {t("nextPage")}
            </Link>
          </Button>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function FilterField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NativeSelect({
  children,
  defaultValue,
  name,
}: {
  children: React.ReactNode;
  defaultValue: string;
  name: string;
}) {
  return (
    <select
      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
      defaultValue={defaultValue}
      name={name}
    >
      {children}
    </select>
  );
}

async function BusinessCalendarBookingCard({
  booking,
  canMessage,
  organizationId,
}: {
  booking: BusinessCalendarBookingItem;
  canMessage: boolean;
  organizationId: string;
}) {
  const [t, bookingsT, format] = await Promise.all([
    getTranslations("BusinessCalendar"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  const transitions = booking.permittedTransitions;

  return (
    <Card className="border-primary/10 bg-card/95 shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <Badge variant={booking.type === "restaurant" ? "secondary" : "outline"}>
            {booking.type === "restaurant"
              ? t("tableReservation")
              : t("serviceBooking")}
          </Badge>
          <CardTitle className="mt-2 text-lg">{booking.serviceName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {format.dateTimeRange(booking.startsAt, booking.endsAt, {
              timeZone: booking.timezone,
              dateStyle: "medium",
              timeStyle: "short",
              hour12: true,
            })}
          </p>
        </div>
        <Badge
          variant={
            booking.status === "CANCELLED" || booking.status === "NO_SHOW"
              ? "destructive"
              : booking.status === "COMPLETED"
                ? "secondary"
                : "default"
          }
        >
          {bookingsT(`statuses.${booking.status}`)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoLine label={t("customer")} value={booking.customerName} />
          <InfoLine label={t("branch")} value={booking.branchName} />
          {booking.customerPhone ? (
            <InfoLine label={t("customerPhone")} value={booking.customerPhone} />
          ) : null}
          {booking.customerEmail ? (
            <InfoLine label={t("customerEmail")} value={booking.customerEmail} />
          ) : null}
          {booking.type === "service" ? (
            <InfoLine
              label={t("employee")}
              value={booking.member?.name ?? t("anyEmployee")}
            />
          ) : null}
          <InfoLine label={t("price")} value={booking.price} />
        </div>

        {booking.notes ? (
          <p className="rounded-xl bg-muted p-3">
            <span className="font-medium">{t("notes")}: </span>
            {booking.notes}
          </p>
        ) : null}

        {booking.restaurantReservation ? (
          <div className="rounded-2xl border bg-muted/30 p-3">
            <p className="flex items-center gap-2 font-medium">
              <UsersRound className="size-4 text-primary" />
              {t("guests", {
                count: booking.restaurantReservation.guestCount,
              })}
            </p>
            <p className="mt-2 text-muted-foreground">
              {t("table")}: {booking.restaurantReservation.tableName}
              {booking.restaurantReservation.seatingArea
                ? ` · ${booking.restaurantReservation.seatingArea}`
                : ""}
            </p>
            {booking.restaurantReservation.items.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1 font-medium">{t("menuPreorder")}</p>
                {booking.restaurantReservation.items.map((item) => (
                  <p key={item.name} className="text-muted-foreground">
                    {item.quantity}× {item.name}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link
              href={booking.type === "restaurant"
                ? `/business/reservations/${booking.id}`
                : `/business/bookings/${booking.id}`}
            >
              {bookingsT("viewDetails")}
            </Link>
          </Button>
          {canMessage ? (
            <form action={openBookingConversation.bind(null, "business", booking.id)}>
              <Button size="sm" variant="outline" type="submit">
                <MessageCircle className="size-4" />
                {t("messageCustomer")}
              </Button>
            </form>
          ) : null}
          {transitions.map((status) => (
            <BookingTransitionForm
              key={status}
              bookingId={booking.id}
              contextOrganizationId={organizationId}
              expectedVersion={booking.version}
              idempotencyKey={randomUUID()}
              label={transitionLabel(t, status)}
              nextStatus={status}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

async function StaffCalendarBookingCard({
  booking,
}: {
  booking: StaffSelfCalendarBookingItem;
}) {
  const [t, bookingsT, format] = await Promise.all([
    getTranslations("BusinessCalendar"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  return (
    <Card className="border-primary/10 bg-card/95 shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{booking.serviceName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {format.dateTimeRange(booking.startsAt, booking.endsAt, {
              dateStyle: "medium",
              hour12: true,
              timeStyle: "short",
              timeZone: booking.timezone,
            })}
          </p>
        </div>
        <Badge>{bookingsT(`statuses.${booking.status}`)}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <InfoLine label={t("customer")} value={booking.customerName} />
        <InfoLine label={t("branch")} value={booking.branchName} />
        {booking.notes ? (
          <p className="rounded-xl bg-muted p-3">
            <span className="font-medium">{t("notes")}: </span>
            {booking.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function transitionLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  status: BookingStatus,
) {
  if (status === "CONFIRMED") return t("confirmBooking");
  if (status === "CANCELLED") return t("cancelBooking");
  if (status === "COMPLETED") return t("markCompleted");
  return t("markNoShow");
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  );
}
