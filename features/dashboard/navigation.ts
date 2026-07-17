import {
  Bell,
  Bot,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  Clock3,
  Heart,
  LayoutDashboard,
  MapPin,
  Menu as MenuIcon,
  PanelsTopLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  ShoppingBag,
  Armchair,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { BusinessVertical, CommercePermission, SystemRole } from "@prisma/client";

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
        title: "favorites",
        href: "/customer/favorites",
        icon: Heart,
      },
      {
        title: "workInvitations",
        href: "/customer/work-invitations",
        icon: BriefcaseBusiness,
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

function businessNavigation(input: {
  canAccessMessages: boolean;
  commercePermissions: readonly CommercePermission[];
  membershipId?: string;
  role: SystemRole | null;
  vertical?: BusinessVertical;
}): DashboardNavigationGroup[] {
  if (!input.role) return [];
  const restaurant = Boolean(
    input.vertical && isRestaurantVertical(input.vertical),
  );
  const management = input.role === "OWNER" || input.role === "MANAGER";
  const staff = input.role === "STAFF";
  const canViewCommerce = input.commercePermissions.length > 0;
  const workspace: DashboardNavigationGroup["items"] = [
    { title: "overview", href: "/business", icon: LayoutDashboard },
    { title: "calendar", href: "/business/calendar", icon: CalendarDays },
    ...(restaurant && !staff
      ? ([
          { title: "reservations", href: "/business/reservations", icon: CalendarRange },
          { title: "tables", href: "/business/tables", icon: Armchair },
          { title: "menu", href: "/business/menu", icon: MenuIcon },
        ] satisfies DashboardNavigationGroup["items"])
      : []),
    ...(!restaurant && !staff
      ? ([{ title: "bookings", href: "/business/bookings", icon: CalendarRange }] satisfies DashboardNavigationGroup["items"])
      : []),
    ...(!restaurant && management
      ? ([{ title: "services", href: "/business/services", icon: Sparkles }] satisfies DashboardNavigationGroup["items"])
      : []),
    ...(management
      ? ([{ title: "team", href: "/business/team", icon: UsersRound }] satisfies DashboardNavigationGroup["items"])
      : []),
    ...(staff
      ? ([
          ...(!restaurant
            ? [{ title: "services" as const, href: "/business/services", icon: Sparkles }]
            : []),
          ...(input.membershipId
            ? [{ title: "availability" as const, href: `/business/team/${input.membershipId}/availability`, icon: Clock3 }]
            : []),
        ] satisfies DashboardNavigationGroup["items"])
      : []),
    ...(canViewCommerce
      ? ([{
          title: "commerce",
          href: "/business/commerce",
          icon: ShoppingBag,
          children: [
            ...(input.commercePermissions.includes("STORE_VIEW")
              ? [{ title: "commerceStore" as const, href: "/business/commerce/store", icon: ShoppingBag }]
              : []),
            ...(input.role === "OWNER"
              ? [{ title: "commerceAccess" as const, href: "/business/commerce/access", icon: ShieldCheck }]
              : []),
          ],
        }] satisfies DashboardNavigationGroup["items"])
      : []),
    ...(management
      ? ([
          { title: "publicProfile", href: "/business/public-profile", icon: PanelsTopLeft },
          { title: "business", href: "/business/manage", icon: Building2 },
          { title: "locations", href: "/business/manage/locations", icon: MapPin },
          { title: "settings", href: "/business/manage/settings", icon: Settings },
          ...(input.role === "OWNER"
            ? [{ title: "audit" as const, href: "/business/manage/audit", icon: ShieldCheck }]
            : []),
        ] satisfies DashboardNavigationGroup["items"])
      : []),
  ];
  const insights: DashboardNavigationGroup["items"] = [
    { title: "notifications", href: "/business/notifications", icon: Bell },
    ...(management
      ? ([
          { title: "analytics", href: "/business/analytics", icon: ChartNoAxesCombined },
          ...(!restaurant
            ? [{ title: "reviews" as const, href: "/business/reviews", icon: Star }]
            : []),
          ...(input.canAccessMessages
            ? [{ title: "messages" as const, href: "/business/messages", icon: BookOpen }]
            : []),
        ] satisfies DashboardNavigationGroup["items"])
      : []),
  ];
  return [
    { label: "workspace", items: workspace },
    ...(insights.length ? [{ label: "insights" as const, items: insights }] : []),
  ];
}

export function getDashboardNavigation(
  role: DashboardRole,
  vertical?: BusinessVertical,
  systemRole: SystemRole | null = null,
  membershipId?: string,
  canAccessMessages = true,
  commercePermissions: readonly CommercePermission[] = [],
): DashboardNavigationGroup[] {
  if (role !== "business") return customerNavigation;
  return businessNavigation({
    canAccessMessages,
    commercePermissions,
    membershipId,
    role: systemRole,
    vertical,
  });
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
  "work-invitations": "workInvitations",
  notifications: "notifications",
  profile: "profile",
  "public-profile": "publicProfile",
  calendar: "calendar",
  availability: "availability",
  services: "services",
  reservations: "reservations",
  tables: "tables",
  menu: "menu",
  team: "team",
  manage: "business",
  locations: "locations",
  settings: "settings",
  analytics: "analytics",
  audit: "audit",
  reviews: "reviews",
  messages: "messages",
  admin: "admin",
  assistant: "assistant",
  commerce: "commerce",
  store: "commerceStore",
  access: "commerceAccess",
};
