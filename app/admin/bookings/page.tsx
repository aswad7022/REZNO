import { getFormatter } from "next-intl/server";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminBookings } from "@/features/admin/services/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminBookingsPage() {
  const [bookings, format] = await Promise.all([
    getAdminBookings(),
    getFormatter(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="كل الحجوزات"
        description="متابعة الحجوزات الموجودة في المنصة عبر كل الأنشطة."
      />
      <div className="grid gap-3">
        {bookings.map((booking) => (
          <Card key={booking.id} className="border-primary/10">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">{booking.serviceNameSnapshot}</p>
                <p className="text-sm text-muted-foreground">
                  {booking.organization.name} · {booking.customerNameSnapshot}
                </p>
                <p className="text-xs text-muted-foreground">
                  {booking.branch.name} ·{" "}
                  {format.dateTime(booking.startsAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    hour12: true,
                    timeZone: booking.branch.timezone,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{booking.status}</Badge>
                <Badge variant="secondary">{booking.organization.vertical}</Badge>
                {booking.member ? (
                  <Badge variant="outline">
                    {booking.member.person.displayName ??
                      booking.member.person.firstName}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
