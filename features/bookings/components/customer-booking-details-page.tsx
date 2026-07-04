import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { BookingCard } from "@/features/bookings/components/booking-card";
import { getCustomerBookingDetails } from "@/features/bookings/services/bookings";

export async function CustomerBookingDetailsPage({
  bookingId,
  created = false,
}: {
  bookingId: string;
  created?: boolean;
}) {
  const [booking, t, format] = await Promise.all([
    getCustomerBookingDetails(bookingId),
    getTranslations("Bookings"),
    getFormatter(),
  ]);

  if (!booking) {
    notFound();
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={created ? t("confirmationTitle") : t("detailsTitle")}
        description={
          created ? t("confirmationDescription") : t("detailsDescription")
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/customer/bookings">{t("backToBookings")}</Link>
          </Button>
        }
      />
      {created ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{t("created")}</span>
        </p>
      ) : null}
      <div className="max-w-3xl">
        <BookingCard
          booking={booking}
          audience="customer"
          showDetailsLink={false}
          formattedRange={format.dateTimeRange(
            booking.startsAt,
            booking.endsAt,
            {
              timeZone: booking.timezone,
              dateStyle: "full",
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
            transitions: {
              CONFIRMED: t("actions.CONFIRMED"),
              CANCELLED: t("actions.CANCELLED"),
              COMPLETED: t("actions.COMPLETED"),
              NO_SHOW: t("actions.NO_SHOW"),
            },
          }}
        />
      </div>
    </DashboardShell>
  );
}
