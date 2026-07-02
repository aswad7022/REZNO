import Link from "next/link";
import { Armchair, CalendarCheck2, Layers3, Utensils } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRestaurantOverviewStats } from "@/features/restaurants/services/restaurant-management";

export async function RestaurantOverviewPanel() {
  const stats = await getRestaurantOverviewStats();
  const items = [
    {
      title: "الطاولات النشطة",
      value: stats.activeTables,
      icon: Armchair,
      href: "/business/tables",
    },
    {
      title: "أصناف القائمة",
      value: stats.menuItems,
      icon: Utensils,
      href: "/business/menu",
    },
    {
      title: "أقسام القائمة",
      value: stats.menuCategories,
      icon: Layers3,
      href: "/business/menu",
    },
    {
      title: "حجوزات اليوم",
      value: stats.todayBookings,
      icon: CalendarCheck2,
      href: "/business/bookings",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title} className="rezno-card-hover border-primary/10">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">
              {item.title}
            </CardTitle>
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="size-4" aria-hidden="true" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tracking-tight">{item.value}</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href={item.href}>إدارة</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
