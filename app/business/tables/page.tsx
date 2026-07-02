import type { Metadata } from "next";

import { RestaurantTablesPage } from "@/features/restaurants/components/restaurant-tables-page";

export const metadata: Metadata = {
  title: "الطاولات | REZNO",
};

export default function BusinessTablesRoute() {
  return <RestaurantTablesPage />;
}
