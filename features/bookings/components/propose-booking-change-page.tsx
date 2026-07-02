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
import { proposeBookingChange } from "@/features/bookings/actions/manage-bookings";
import { BookingEmployeeSelect } from "@/features/bookings/components/booking-employee-select";
import { getBusinessBookingForChange } from "@/features/bookings/services/bookings";
import { getBookingSlotResult } from "@/features/bookings/services/slots";

function todayInBaghdad(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function ProposeBookingChangePage({
  bookingId,
  date,
  memberId,
  error,
}: {
  bookingId: string;
  date?: string;
  memberId?: string;
  error?: "invalid" | "unavailable";
}) {
  const [booking, t, format] = await Promise.all([
    getBusinessBookingForChange(bookingId),
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

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("changeRequest.title")}
        description={t("changeRequest.description", {
          customer: booking.customerName,
          service: booking.serviceName,
        })}
      />
      <Card>
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
            />
            <Button type="submit">{t("findTimes")}</Button>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSlots.map((slot) => (
            <form
              key={`${slot.startsAt}-${slot.memberId ?? "none"}`}
              action={proposeBookingChange.bind(null, booking.id)}
              className="rounded-xl border bg-card p-4 shadow-sm"
            >
              <input type="hidden" name="branchServiceId" value={booking.branchServiceId} />
              <input type="hidden" name="date" value={selectedDate} />
              <input type="hidden" name="startsAt" value={slot.startsAt} />
              <input type="hidden" name="memberId" value={slot.memberId ?? ""} />
              <p className="font-medium">
                {format.dateTime(new Date(slot.startsAt), {
                  timeZone: booking.timezone,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {slot.memberName ?? t("automaticStaff")}
              </p>
              <Button type="submit" className="mt-3 w-full">
                {t("changeRequest.propose")}
              </Button>
            </form>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
