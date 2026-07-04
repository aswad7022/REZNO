import { CalendarX } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { BookingCard } from "@/features/bookings/components/booking-card";
import { getBusinessBookings } from "@/features/bookings/services/bookings";

export async function BusinessBookingsPage({
  calendar = false,
}: {
  calendar?: boolean;
}) {
  const [{ bookings, canOperate }, t, format] = await Promise.all([
    getBusinessBookings({ calendar }),
    getTranslations("Bookings"),
    getFormatter(),
  ]);

  const grouped = bookings.reduce<Map<string, typeof bookings>>(
    (groups, booking) => {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: booking.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(booking.startsAt);
      const group = groups.get(key) ?? [];
      group.push(booking);
      groups.set(key, group);
      return groups;
    },
    new Map(),
  );

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={calendar ? t("calendarTitle") : t("businessTitle")}
        description={
          calendar ? t("calendarDescription") : t("businessDescription")
        }
      />
      {bookings.length === 0 ? (
        <DashboardEmpty
          icon={CalendarX}
          title={t("businessEmptyTitle")}
          description={t("businessEmptyDescription")}
        />
      ) : calendar ? (
        <div className="space-y-8">
          {[...grouped.entries()].map(([dateKey, items]) => (
            <section key={dateKey} aria-labelledby={`date-${dateKey}`}>
              <h2 id={`date-${dateKey}`} className="mb-3 text-lg font-semibold">
                {format.dateTime(items[0].startsAt, {
                  timeZone: items[0].timezone,
                  dateStyle: "full",
                })}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {items.map((booking) => (
                  <BusinessBookingCard
                    key={booking.id}
                    booking={booking}
                    canOperate={canOperate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {bookings.map((booking) => (
            <BusinessBookingCard
              key={booking.id}
              booking={booking}
              canOperate={canOperate}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

async function BusinessBookingCard({
  booking,
  canOperate,
}: {
  booking: Awaited<ReturnType<typeof getBusinessBookings>>["bookings"][number];
  canOperate: boolean;
}) {
  const [t, format] = await Promise.all([
    getTranslations("Bookings"),
    getFormatter(),
  ]);

  return (
    <BookingCard
      booking={booking}
      audience="business"
      canOperate={canOperate}
      formattedRange={format.dateTimeRange(booking.startsAt, booking.endsAt, {
        timeZone: booking.timezone,
        dateStyle: "medium",
        timeStyle: "short",
        hour12: true,
      })}
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
        transitions: {
          CONFIRMED: t("actions.CONFIRMED"),
          CANCELLED: t("actions.CANCELLED"),
          COMPLETED: t("actions.COMPLETED"),
          NO_SHOW: t("actions.NO_SHOW"),
        },
      }}
    />
  );
}
