import type { Metadata } from "next";

import { RestaurantMenuPage } from "@/features/restaurants/components/restaurant-menu-page";

export const metadata: Metadata = {
  title: "القائمة | REZNO",
};

export default function BusinessMenuRoute() {
  return <RestaurantMenuPage />;
}
