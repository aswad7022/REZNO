import type { Metadata } from "next";

import { RestaurantMenuPage } from "@/features/restaurants/components/restaurant-menu-page";

export const metadata: Metadata = {
  title: "القائمة | REZNO",
};

export default async function BusinessMenuRoute({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { create } = await searchParams;
  return <RestaurantMenuPage showCreateForm={create === "category"} />;
}
