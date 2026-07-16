import type { Metadata } from "next";

import { RestaurantTablesPage } from "@/features/restaurants/components/restaurant-tables-page";

export const metadata: Metadata = {
  title: "الطاولات | REZNO",
};

export default async function BusinessTablesRoute({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { create } = await searchParams;
  return <RestaurantTablesPage showCreateForm={create === "table"} />;
}
