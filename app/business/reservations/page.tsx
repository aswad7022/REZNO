import type { Metadata } from "next";
import { CalendarRange, UsersRound, Utensils } from "lucide-react";
import { getFormatter } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { openBookingConversation } from "@/features/messages/actions/messages";
import { getRestaurantReservationsOverview } from "@/features/restaurants/services/restaurant-management";

export const metadata: Metadata = {
  title: "الحجوزات | REZNO",
};

export default async function BusinessReservationsRoute() {
  const [{ bookings }, format] = await Promise.all([
    getRestaurantReservationsOverview(),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="حجوزات الطاولات"
        description="تابع حجوزات الطاولات الواردة من الصفحة العامة والقائمة الاختيارية."
      />
      {bookings.length === 0 ? (
        <DashboardEmpty
          icon={CalendarRange}
          title="لا توجد حجوزات طاولات بعد"
          description="عندما يحجز العملاء طاولة من الصفحة العامة ستظهر الحجوزات هنا مع عدد الضيوف والطاولة والطلبات الاختيارية."
        />
      ) : (
        <div className="grid gap-3">
          {bookings.map((booking) => (
            <Card key={booking.id} className="border-primary/10">
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-semibold">{booking.serviceNameSnapshot}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {booking.customerNameSnapshot} · {booking.branch.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format.dateTime(booking.startsAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      hour12: true,
                      timeZone: booking.branch.timezone,
                    })}
                  </p>
                  {booking.restaurantReservation ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="gap-1">
                        <UsersRound className="size-3" />
                        {booking.restaurantReservation.guestCount} ضيوف
                      </Badge>
                      <Badge variant="secondary">
                        {booking.restaurantReservation.table.name}
                      </Badge>
                      {booking.restaurantReservation.seatingArea ? (
                        <Badge variant="outline">
                          {booking.restaurantReservation.seatingArea}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                  {booking.restaurantReservation?.customerNote ? (
                    <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
                      {booking.restaurantReservation.customerNote}
                    </p>
                  ) : null}
                  {booking.restaurantReservation?.items.length ? (
                    <div className="mt-3 rounded-xl border bg-background p-3">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Utensils className="size-4 text-primary" />
                        الطلبات المسبقة
                      </p>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {booking.restaurantReservation.items.map((item) => (
                          <p key={item.id}>
                            {item.quantity}× {item.itemNameSnapshot ?? item.menuItem.name}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={openBookingConversation.bind(null, "business", booking.id)}>
                    <Button size="sm" variant="outline" type="submit">
                      مراسلة العميل
                    </Button>
                  </form>
                  <Badge>{booking.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
