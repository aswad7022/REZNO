import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { WorkspaceState } from "@/components/operations/workspace-surface";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminRestaurants } from "@/features/admin/services/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminRestaurantsPage() {
  const [restaurants, t] = await Promise.all([
    getAdminRestaurants(),
    getTranslations("Admin"),
  ]);

  return (
    <>
      <AdminPageHeader
        title={t("restaurantsTitle")}
        description={t("restaurantsDescription")}
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
                  {t("restaurantsStats", {
                    bookings: business._count.bookings,
                    branches: business._count.branches,
                    items: business._count.menuItems,
                    tables: business._count.restaurantTables,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{business.vertical}</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/${business.slug}`} target="_blank">
                    {t("viewPublicPage")}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {restaurants.length === 0 ? (
          <div data-admin-restaurants-state="empty">
            <WorkspaceState
              title={t("restaurantsEmptyTitle")}
              description={t("restaurantsEmptyDescription")}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
