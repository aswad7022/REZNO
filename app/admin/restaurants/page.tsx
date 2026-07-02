import Link from "next/link";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminRestaurants } from "@/features/admin/services/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminRestaurantsPage() {
  const restaurants = await getAdminRestaurants();

  return (
    <>
      <AdminPageHeader
        title="المطاعم والكافيهات"
        description="متابعة الأنشطة التي تستخدم تجربة الطاولات والقائمة."
      />
      <div className="grid gap-3">
        {restaurants.map((business) => (
          <Card key={business.id} className="border-primary/10">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Link
                  href={`/admin/businesses/${business.id}`}
                  className="font-semibold hover:text-primary"
                >
                  {business.name}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {business.profile?.businessCategory ?? business.vertical}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {business._count.branches} فرع ·{" "}
                  {business._count.restaurantTables} طاولة ·{" "}
                  {business._count.menuItems} صنف ·{" "}
                  {business._count.bookings} حجز
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{business.vertical}</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/${business.slug}`} target="_blank">
                    الصفحة العامة
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
