import {
  Bell,
  Bot,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  LayoutDashboard,
  MapPin,
  Menu as MenuIcon,
  PanelsTopLeft,
  Settings,
  Sparkles,
  Armchair,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { BusinessVertical } from "@prisma/client";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import type {
  DashboardNavigationItemKey,
  DashboardNavigationGroup,
  DashboardRole,
} from "@/types/dashboard";

const customerNavigation: DashboardNavigationGroup[] = [
  {
    label: "workspace",
    items: [
      {
        title: "overview",
        href: "/customer",
        icon: LayoutDashboard,
      },
      {
        title: "myBookings",
        href: "/customer/bookings",
        icon: CalendarDays,
        children: [
          {
            title: "upcoming",
            href: "/customer/bookings/upcoming",
            icon: Clock3,
          },
          {
            title: "history",
            href: "/customer/bookings/history",
            icon: BookOpen,
          },
        ],
      },
      {
        title: "assistant",
        href: "/customer/assistant",
        icon: Bot,
      },
    ],
  },
  {
    label: "account",
    items: [
      {
        title: "notifications",
        href: "/customer/notifications",
        icon: Bell,
      },
      {
        title: "messages",
        href: "/customer/messages",
        icon: BookOpen,
      },
      {
        title: "profile",
        href: "/customer/profile",
        icon: UserRound,
      },
    ],
  },
];

const businessNavigation: DashboardNavigationGroup[] = [
  {
    label: "workspace",
    items: [
      {
        title: "overview",
        href: "/business",
        icon: LayoutDashboard,
      },
      {
        title: "publicProfile",
        href: "/business/public-profile",
        icon: PanelsTopLeft,
      },
      {
        title: "bookings",
        href: "/business/bookings",
        icon: CalendarRange,
      },
      {
        title: "calendar",
        href: "/business/calendar",
        icon: CalendarDays,
      },
      {
        title: "services",
        href: "/business/services",
        icon: Sparkles,
      },
      {
        title: "team",
        href: "/business/team",
        icon: UsersRound,
      },
      {
        title: "business",
        href: "/business/manage",
        icon: Building2,
        children: [
          {
            title: "locations",
            href: "/business/manage/locations",
            icon: MapPin,
          },
          {
            title: "settings",
            href: "/business/manage/settings",
            icon: Settings,
          },
        ],
      },
    ],
  },
  {
    label: "insights",
    items: [
      {
        title: "notifications",
        href: "/business/notifications",
        icon: Bell,
      },
      {
        title: "messages",
        href: "/business/messages",
        icon: BookOpen,
      },
    ],
  },
];

const restaurantNavigation: DashboardNavigationGroup[] = [
  {
    label: "workspace",
    items: [
      { title: "overview", href: "/business", icon: LayoutDashboard },
      { title: "reservations", href: "/business/reservations", icon: CalendarRange },
      { title: "tables", href: "/business/tables", icon: Armchair },
      { title: "menu", href: "/business/menu", icon: MenuIcon },
      { title: "publicProfile", href: "/business/public-profile", icon: PanelsTopLeft },
      { title: "calendar", href: "/business/calendar", icon: CalendarDays },
      {
        title: "business",
        href: "/business/manage",
        icon: Building2,
        children: [
          { title: "locations", href: "/business/manage/locations", icon: MapPin },
          { title: "settings", href: "/business/manage/settings", icon: Settings },
        ],
      },
    ],
  },
  {
    label: "insights",
    items: [
      { title: "notifications", href: "/business/notifications", icon: Bell },
      { title: "messages", href: "/business/messages", icon: BookOpen },
    ],
  },
];

export function getDashboardNavigation(
  role: DashboardRole,
  vertical?: BusinessVertical,
): DashboardNavigationGroup[] {
  if (role !== "business") return customerNavigation;
  return vertical && isRestaurantVertical(vertical)
    ? restaurantNavigation
    : businessNavigation;
}

export function isNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const dashboardRouteLabels: Readonly<
  Record<string, DashboardNavigationItemKey>
> = {
  customer: "dashboard",
  business: "dashboard",
  bookings: "bookings",
  upcoming: "upcoming",
  history: "history",
  favorites: "favorites",
  notifications: "notifications",
  profile: "profile",
  "public-profile": "publicProfile",
  calendar: "calendar",
  services: "services",
  reservations: "reservations",
  tables: "tables",
  menu: "menu",
  team: "team",
  manage: "business",
  locations: "locations",
  settings: "settings",
  analytics: "analytics",
  messages: "messages",
  admin: "admin",
  assistant: "assistant",
};
