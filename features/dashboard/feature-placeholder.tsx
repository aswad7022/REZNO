import {
  Bell,
  BookOpen,
  CalendarDays,
  Clock3,
  Heart,
} from "lucide-react";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import type { DashboardRole } from "@/types/dashboard";

interface FeatureDefinition {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: typeof CalendarDays;
}

const customerFeatures: Readonly<Record<string, FeatureDefinition>> = {
  bookings: {
    title: "My bookings",
    description: "View and manage all your appointments.",
    emptyTitle: "No bookings yet",
    emptyDescription:
      "Your upcoming and previous appointments will appear here.",
    icon: CalendarDays,
  },
  "bookings/upcoming": {
    title: "Upcoming bookings",
    description: "Appointments you have scheduled.",
    emptyTitle: "Nothing scheduled",
    emptyDescription: "Your next confirmed appointment will appear here.",
    icon: Clock3,
  },
  "bookings/history": {
    title: "Booking history",
    description: "A record of your previous appointments.",
    emptyTitle: "No booking history",
    emptyDescription: "Completed and cancelled bookings will appear here.",
    icon: BookOpen,
  },
  favorites: {
    title: "Favorites",
    description: "Businesses and services you have saved.",
    emptyTitle: "No favorites yet",
    emptyDescription: "Save businesses to find them quickly next time.",
    icon: Heart,
  },
  notifications: {
    title: "Notifications",
    description: "Booking updates and important account activity.",
    emptyTitle: "You're all caught up",
    emptyDescription: "New notifications will appear here.",
    icon: Bell,
  },
};

export const deferredBusinessRouteRegistry = {
  "/business/media": "Stage 5 Media, Storage and Payments Foundation",
  "/business/payments": "Stage 5 Media, Storage and Payments Foundation",
  "/business/platform": "Stage 6 Admin and Platform Operations",
  "/business/release": "Stage 7 Release QA",
  "/business/visual": "Stage 8 Final Visual Polish",
} as const;

export function getFeatureDefinition(
  role: DashboardRole,
  segments: string[],
): FeatureDefinition | undefined {
  const key = segments.join("/");
  return role === "business" ? undefined : customerFeatures[key];
}

export function DashboardFeaturePlaceholder({
  feature,
}: {
  feature: FeatureDefinition;
}) {
  return (
    <DashboardShell>
      <DashboardPageHeader
        title={feature.title}
        description={feature.description}
      />
      <DashboardEmpty
        icon={feature.icon}
        title={feature.emptyTitle}
        description={feature.emptyDescription}
      />
    </DashboardShell>
  );
}
