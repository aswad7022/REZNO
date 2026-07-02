import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  Clock3,
  Heart,
  MapPin,
  MessageSquare,
  Settings,
  Sparkles,
  UsersRound,
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

const businessFeatures: Readonly<Record<string, FeatureDefinition>> = {
  bookings: {
    title: "Bookings",
    description: "Manage customer appointments across your business.",
    emptyTitle: "No bookings yet",
    emptyDescription: "New customer bookings will appear here.",
    icon: CalendarRange,
  },
  calendar: {
    title: "Calendar",
    description: "See your team's schedule at a glance.",
    emptyTitle: "Your calendar is clear",
    emptyDescription: "Scheduled appointments will appear here.",
    icon: CalendarDays,
  },
  services: {
    title: "Services",
    description: "Manage the services customers can book.",
    emptyTitle: "No services configured",
    emptyDescription: "Your bookable services will appear here.",
    icon: Sparkles,
  },
  team: {
    title: "Team",
    description: "Manage team members, roles, and assignments.",
    emptyTitle: "No team members yet",
    emptyDescription: "People added to your organization will appear here.",
    icon: UsersRound,
  },
  manage: {
    title: "Business",
    description: "Manage your organization and operating settings.",
    emptyTitle: "Business setup is ready to begin",
    emptyDescription: "Your organization details will appear here.",
    icon: Building2,
  },
  "manage/locations": {
    title: "Locations",
    description: "Manage branches, contact details, and business hours.",
    emptyTitle: "No locations configured",
    emptyDescription: "Your business locations will appear here.",
    icon: MapPin,
  },
  "manage/settings": {
    title: "Business settings",
    description: "Control booking and marketplace preferences.",
    emptyTitle: "No settings available yet",
    emptyDescription: "Organization preferences will appear here.",
    icon: Settings,
  },
  analytics: {
    title: "Analytics",
    description: "Understand bookings, revenue, and customer trends.",
    emptyTitle: "No analytics data yet",
    emptyDescription: "Insights will appear as your business receives bookings.",
    icon: ChartNoAxesCombined,
  },
  messages: {
    title: "Messages",
    description: "Keep customer conversations in one place.",
    emptyTitle: "No messages",
    emptyDescription: "New customer conversations will appear here.",
    icon: MessageSquare,
  },
  notifications: {
    title: "Notifications",
    description: "Important booking and business updates.",
    emptyTitle: "You're all caught up",
    emptyDescription: "New notifications will appear here.",
    icon: Bell,
  },
};

export function getFeatureDefinition(
  role: DashboardRole,
  segments: string[],
): FeatureDefinition | undefined {
  const key = segments.join("/");
  return role === "business"
    ? businessFeatures[key]
    : customerFeatures[key];
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
