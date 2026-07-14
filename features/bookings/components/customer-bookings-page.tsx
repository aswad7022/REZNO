import Link from "next/link";
import { CalendarX, Plus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { BookingCard } from "@/features/bookings/components/booking-card";
import { getCustomerBookings } from "@/features/bookings/services/bookings";

type BookingFilter = "all" | "upcoming" | "history";

export async function CustomerBookingsPage({
  filter = "all",
  created = false,
  rescheduled = false,
}: {
  filter?: BookingFilter;
  created?: boolean;
  rescheduled?: boolean;
}) {
  const [allBookings, t, format] = await Promise.all([
    getCustomerBookings(filter),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  const bookings = allBookings;

  const title =
    filter === "upcoming"
      ? t("upcomingTitle")
      : filter === "history"
        ? t("historyTitle")
        : t("customerTitle");

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={title}
        description={t("customerDescription")}
        actions={
          <Button asChild>
            <Link href="/customer/bookings/new">
              <Plus aria-hidden="true" />
              {t("newBooking")}
            </Link>
          </Button>
        }
      />
      {created || rescheduled ? (
        <p
          role="status"
          className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"
        >
          {t(rescheduled ? "rescheduled" : "created")}
        </p>
      ) : null}
      {bookings.length === 0 ? (
        <DashboardEmpty
          icon={CalendarX}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild variant="outline">
              <Link href="/customer/bookings/new">{t("newBooking")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              audience="customer"
              formattedRange={format.dateTimeRange(
                booking.startsAt,
                booking.endsAt,
                {
                  timeZone: booking.timezone,
                  dateStyle: "medium",
                  timeStyle: "short",
                  hour12: true,
                },
              )}
              formattedPendingChange={
                booking.pendingChange
                  ? format.dateTimeRange(
                      booking.pendingChange.startsAt,
                      booking.pendingChange.endsAt,
                      {
                        timeZone: booking.timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                        hour12: true,
                      },
                    )
                  : undefined
              }
              labels={{
                status: t(`statuses.${booking.status}`),
                customer: t("customer"),
                staff: t("staff"),
                automaticStaff: t("automaticStaff"),
                cancel: t("cancel"),
                reschedule: t("reschedule"),
                business: t("business"),
                price: t("price"),
                contact: t("contactBusiness"),
                viewDetails: t("viewDetails"),
                messageBusiness: t("messageBusiness"),
                messageCustomer: t("messageCustomer"),
                table: t("restaurant.table"),
                guests: t("restaurant.guests"),
                preorder: t("restaurant.preorder"),
                reviewSubmitted: t("reviewSubmitted"),
                proposeChange: t("changeRequest.propose"),
                changeRequested: t("changeRequest.customerTitle"),
                acceptChange: t("changeRequest.accept"),
                rejectChange: t("changeRequest.reject"),
                pendingChangeStaff: t("staff"),
                waitingForCustomer: t("changeRequest.waiting"),
                waitingForBusiness: t("changeRequest.waitingForBusiness"),
                transitions: {
                  CONFIRMED: t("actions.CONFIRMED"),
                  CANCELLED: t("actions.CANCELLED"),
                  COMPLETED: t("actions.COMPLETED"),
                  NO_SHOW: t("actions.NO_SHOW"),
                },
              }}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
