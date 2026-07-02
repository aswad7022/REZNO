import { CalendarClock } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rescheduleCustomerBooking } from "@/features/bookings/actions/manage-bookings";
import { BookingEmployeeSelect } from "@/features/bookings/components/booking-employee-select";
import {
  BookingProgress,
  groupSlotsByPeriod,
} from "@/features/bookings/components/booking-flow-parts";
import { getCustomerBookingForReschedule } from "@/features/bookings/services/bookings";
import { getBookingSlotResult } from "@/features/bookings/services/slots";

function todayInBaghdad(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function RescheduleBookingPage({
  bookingId,
  date,
  memberId,
  error,
}: {
  bookingId: string;
  date?: string;
  memberId?: string;
  error?: "invalid" | "unavailable" | "notAllowed";
}) {
  const [booking, t, format] = await Promise.all([
    getCustomerBookingForReschedule(bookingId),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  if (!booking) notFound();

  const today = todayInBaghdad();
  const selectedDate = date && date >= today ? date : today;
  const result = await getBookingSlotResult(
    booking.branchServiceId,
    selectedDate,
  );
  const employees = Array.from(
    new Map(
      result.slots.flatMap((slot) =>
        slot.memberId && slot.memberName
          ? [[slot.memberId, slot.memberName] as const]
          : [],
      ),
    ),
    ([id, name]) => ({ id, name }),
  );
  const fixedMemberId =
    booking.staffSelectionMode === "REQUIRED" && employees.length === 1
      ? employees[0].id
      : undefined;
  const selectedMemberId =
    fixedMemberId ??
    (employees.some((employee) => employee.id === memberId)
      ? memberId
      : undefined);
  const automaticSlots = Array.from(
    new Map(result.slots.map((slot) => [slot.startsAt, slot] as const)).values(),
  );
  const visibleSlots =
    booking.staffSelectionMode === "NONE"
      ? result.slots.filter((slot) => slot.memberId === null)
      : booking.staffSelectionMode === "OPTIONAL"
        ? selectedMemberId
          ? result.slots.filter((slot) => slot.memberId === selectedMemberId)
          : automaticSlots
        : selectedMemberId
          ? result.slots.filter((slot) => slot.memberId === selectedMemberId)
          : [];
  const groupedSlots = groupSlotsByPeriod(visibleSlots, booking.timezone);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("rescheduleTitle")}
        description={t("rescheduleDescription", {
          service: booking.serviceName,
          branch: booking.branchName,
        })}
      />
      <BookingProgress
        activeStep={
          booking.staffSelectionMode === "REQUIRED" &&
          employees.length > 0 &&
          !selectedMemberId
            ? "staff"
            : "time"
        }
        staffSkipped={booking.staffSelectionMode === "NONE"}
        labels={{
          service: t("steps.service"),
          staff: t("steps.staff"),
          time: t("steps.time"),
          confirm: t("steps.confirm"),
        }}
      />
      {!booking.canReschedule ? (
        <DashboardEmpty
          icon={CalendarClock}
          title={t("rescheduleNotAllowedTitle")}
          description={t("rescheduleNotAllowedDescription")}
        />
      ) : (
        <>
          <Card className="border-primary/10 shadow-md shadow-primary/5">
            <CardHeader>
              <CardTitle>{t("chooseNewDate")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="get" className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="date"
                  name="date"
                  min={today}
                  defaultValue={selectedDate}
                  required
                  className="h-12"
                />
                <Button type="submit" size="lg" className="min-h-12">
                  {t("findTimes")}
                </Button>
              </form>
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`rescheduleErrors.${error}`)}
            </p>
          ) : null}
          {booking.staffSelectionMode !== "NONE" &&
          employees.length > 0 &&
          !fixedMemberId ? (
            <BookingEmployeeSelect
              employees={employees}
              mode={booking.staffSelectionMode}
              selectedMemberId={selectedMemberId}
            />
          ) : null}
          {fixedMemberId ? (
            <p className="rounded-xl border bg-primary/5 p-4 text-sm">
              {t("employee.fixed", {
                name:
                  employees.find((employee) => employee.id === fixedMemberId)
                    ?.name ?? "",
              })}
            </p>
          ) : null}
          {visibleSlots.length === 0 ? (
            <DashboardEmpty
              icon={CalendarClock}
              title={
                booking.staffSelectionMode === "REQUIRED" && !selectedMemberId
                  ? t("employee.chooseTitle")
                  : t("noTimesTitle")
              }
              description={
                booking.staffSelectionMode === "REQUIRED" && !selectedMemberId
                  ? t("employee.chooseDescription")
                  : t(`slotReasons.${result.reason}`)
              }
            />
          ) : (
            <div className="space-y-6">
              {groupedSlots.map((group) => (
                <section key={group.period} aria-labelledby={`reschedule-${group.period}`}>
                  <h3
                    id={`reschedule-${group.period}`}
                    className="mb-3 text-sm font-bold text-muted-foreground"
                  >
                    {t(`periods.${group.period}`)}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.slots.map((slot) => (
                      <form
                        key={`${slot.startsAt}-${slot.memberId ?? "none"}`}
                        action={rescheduleCustomerBooking.bind(null, booking.id)}
                        className="rounded-3xl border border-primary/10 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-within:ring-3 focus-within:ring-ring/40"
                      >
                        <input type="hidden" name="branchServiceId" value={booking.branchServiceId} />
                        <input type="hidden" name="date" value={selectedDate} />
                        <input type="hidden" name="startsAt" value={slot.startsAt} />
                        <input type="hidden" name="memberId" value={slot.memberId ?? ""} />
                        <p className="text-2xl font-black tracking-tight">
                          {format.dateTime(new Date(slot.startsAt), {
                            timeZone: booking.timezone,
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {booking.staffSelectionMode === "OPTIONAL" && !selectedMemberId
                            ? t("automaticStaff")
                            : slot.memberName ?? t("automaticStaff")}
                        </p>
                        <Button type="submit" size="lg" className="mt-4 min-h-12 w-full">
                          {t("confirmReschedule")}
                        </Button>
                      </form>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
