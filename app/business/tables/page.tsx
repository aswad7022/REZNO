import type { Metadata } from "next";

import { RestaurantTablesPage } from "@/features/restaurants/components/restaurant-tables-page";

export const metadata: Metadata = {
  title: "الطاولات | REZNO",
};

export default async function BusinessTablesRoute({
  searchParams,
}: {
  searchParams: Promise<{ create?: string; edit?: string }>;
}) {
  const { create, edit } = await searchParams;
  return (
    <RestaurantTablesPage
      editTableId={edit}
      showCreateForm={create === "table"}
    />
  );
}
