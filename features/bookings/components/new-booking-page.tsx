import { Building2, CalendarClock, Clock3, MapPin, UserRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createBooking } from "@/features/bookings/actions/manage-bookings";
import { BookingSearchForm } from "@/features/bookings/components/booking-search-form";
import { BookingEmployeeSelect } from "@/features/bookings/components/booking-employee-select";
import {
  BookingProgress,
  groupSlotsByPeriod,
  type BookingStepKey,
} from "@/features/bookings/components/booking-flow-parts";
import { getPublicOfferings } from "@/features/bookings/services/bookings";
import { getBookingSlotResult } from "@/features/bookings/services/slots";
import type { BookingSlotResult } from "@/features/bookings/types";

function currentDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function NewBookingPage({
  offeringId,
  date,
  error,
  memberId,
}: {
  offeringId?: string;
  date?: string;
  error?: string;
  memberId?: string;
}) {
  const today = currentDate();
  const selectedDate = date && date >= today ? date : today;
  const [offerings, t, format] = await Promise.all([
    getPublicOfferings(),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  const selectedOffering = offerings.find((item) => item.id === offeringId);
  const slotResult: BookingSlotResult = offeringId
    ? await getBookingSlotResult(offeringId, selectedDate)
    : { slots: [], reason: "OFFERING_UNAVAILABLE" };
  const employees = Array.from(
    new Map(
      slotResult.slots.flatMap((slot) =>
        slot.memberId && slot.memberName
          ? [[slot.memberId, slot.memberName] as const]
          : [],
      ),
    ),
    ([id, name]) => ({ id, name }),
  );
  const fixedMemberId =
    selectedOffering?.staffSelectionMode === "REQUIRED" &&
    employees.length === 1
      ? employees[0].id
      : undefined;
  const selectedMemberId = fixedMemberId ?? (employees.some(
    (employee) => employee.id === memberId,
  )
    ? memberId
    : undefined);
  const automaticSlots = Array.from(
    new Map(
      slotResult.slots.map((slot) => [slot.startsAt, slot] as const),
    ).values(),
  );
  const visibleSlots = selectedOffering
    ? selectedOffering.staffSelectionMode === "NONE"
      ? slotResult.slots.filter((slot) => slot.memberId === null)
      : selectedOffering.staffSelectionMode === "OPTIONAL"
        ? selectedMemberId
          ? slotResult.slots.filter(
              (slot) => slot.memberId === selectedMemberId,
            )
          : automaticSlots
        : selectedMemberId
          ? slotResult.slots.filter(
              (slot) => slot.memberId === selectedMemberId,
            )
          : []
    : [];
  const activeStep: BookingStepKey = !selectedOffering
    ? "service"
    : selectedOffering.staffSelectionMode === "REQUIRED" &&
        employees.length > 0 &&
        !selectedMemberId
      ? "staff"
      : "time";
  const staffSkipped = selectedOffering?.staffSelectionMode === "NONE";
  const groupedSlots = selectedOffering
    ? groupSlotsByPeriod(visibleSlots, selectedOffering.timezone)
    : [];

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("newTitle")}
        description={t("newDescription")}
      />
      <BookingProgress
        activeStep={activeStep}
        staffSkipped={staffSkipped}
        labels={{
          service: t("steps.service"),
          staff: t("steps.staff"),
          time: t("steps.time"),
          confirm: t("steps.confirm"),
        }}
      />
      <Card className="border-primary/10 shadow-md shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
              1
            </span>
            {t("chooseService")}
          </CardTitle>
          <CardDescription>{t("chooseServiceDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <BookingSearchForm
            offerings={offerings}
            initialDate={today}
            initialOfferingId={selectedOffering?.id}
          />
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(
            error === "invalid"
              ? "errors.invalid"
              : error === "rateLimited"
                ? "errors.rateLimited"
                : error === "failed"
                  ? "errors.failed"
                : "errors.unavailable",
          )}
        </p>
      ) : null}

      {selectedOffering ? (
        <Card className="border-primary/10 shadow-md shadow-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                2
              </span>
              {t("staffAndTime")}
            </CardTitle>
            <CardDescription>
              {t("offeringSummary", {
                service: selectedOffering.serviceName,
                business: selectedOffering.organizationName,
                branch: selectedOffering.branchName,
                price: format.number(Number(selectedOffering.price), {
                  maximumFractionDigits: 0,
                }),
                duration: selectedOffering.durationMinutes,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedOffering.staffSelectionMode !== "NONE" &&
            employees.length > 0 &&
            !fixedMemberId ? (
              <div className="mb-5">
                <BookingEmployeeSelect
                  employees={employees}
                  mode={selectedOffering.staffSelectionMode}
                  selectedMemberId={selectedMemberId}
                />
              </div>
            ) : null}
            {fixedMemberId ? (
              <p className="mb-5 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm font-medium">
                {t("employee.fixed", {
                  name:
                    employees.find((employee) => employee.id === fixedMemberId)
                      ?.name ?? "",
                })}
              </p>
            ) : null}
            {selectedOffering.staffSelectionMode === "REQUIRED" &&
            employees.length > 0 &&
            !selectedMemberId ? (
              <DashboardEmpty
                icon={CalendarClock}
                title={t("employee.chooseTitle")}
                description={t("employee.chooseDescription")}
              />
            ) : visibleSlots.length === 0 ? (
              <DashboardEmpty
                icon={CalendarClock}
                title={t("noTimesTitle")}
                description={t(`slotReasons.${slotResult.reason}`)}
              />
            ) : (
              <div className="space-y-6">
                {groupedSlots.map((group) => (
                  <section key={group.period} aria-labelledby={`slots-${group.period}`}>
                    <h3
                      id={`slots-${group.period}`}
                      className="mb-3 text-sm font-bold text-muted-foreground"
                    >
                      {t(`periods.${group.period}`)}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.slots.map((slot) => (
                        <form
                          key={`${slot.startsAt}-${slot.memberId ?? "none"}`}
                          action={createBooking}
                          className="rounded-3xl border border-primary/10 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-within:ring-3 focus-within:ring-ring/40"
                        >
                          <input type="hidden" name="branchServiceId" value={selectedOffering.id} />
                          <input type="hidden" name="date" value={selectedDate} />
                          <input type="hidden" name="startsAt" value={slot.startsAt} />
                          <input type="hidden" name="memberId" value={slot.memberId ?? ""} />
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-2xl font-black tracking-tight">
                                {format.dateTime(new Date(slot.startsAt), {
                                  timeZone: selectedOffering.timezone,
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {selectedOffering.staffSelectionMode === "OPTIONAL" &&
                                !selectedMemberId
                                  ? t("automaticStaff")
                                  : slot.memberName ?? t("automaticStaff")}
                              </p>
                            </div>
                            <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                              <CalendarClock className="size-5" aria-hidden="true" />
                            </span>
                          </div>
                          <div className="mt-4 space-y-2 rounded-2xl bg-muted/40 p-3 text-xs text-muted-foreground">
                            <p className="flex items-center gap-2">
                              <Building2 className="size-3.5" aria-hidden="true" />
                              {selectedOffering.organizationName}
                            </p>
                            <p className="flex items-center gap-2">
                              <MapPin className="size-3.5" aria-hidden="true" />
                              {selectedOffering.branchName}
                            </p>
                            <p className="flex items-center gap-2">
                              <Clock3 className="size-3.5" aria-hidden="true" />
                              {t("durationShort", {
                                count: selectedOffering.durationMinutes,
                              })}
                              {" · "}
                              {t("priceShort", {
                                price: format.number(Number(selectedOffering.price), {
                                  maximumFractionDigits: 0,
                                }),
                              })}
                            </p>
                            <p className="flex items-center gap-2">
                              <UserRound className="size-3.5" aria-hidden="true" />
                              {slot.memberName ?? t("automaticStaff")}
                            </p>
                          </div>
                          <Button type="submit" size="lg" className="mt-4 min-h-12 w-full">
                            {t("confirmBooking")}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : offeringId ? (
        <DashboardEmpty
          icon={CalendarClock}
          title={t("noTimesTitle")}
          description={t(`slotReasons.${slotResult.reason}`)}
        />
      ) : offerings.length === 0 ? (
        <DashboardEmpty
          icon={CalendarClock}
          title={t("noServicesTitle")}
          description={t("noServicesDescription")}
        />
      ) : null}
    </DashboardShell>
  );
}
