import type { LucideIcon } from "lucide-react";

export type DashboardRole = "customer" | "business";
export type DashboardNavigationGroupKey = "workspace" | "account" | "insights";
export type DashboardNavigationItemKey =
  | "dashboard"
  | "overview"
  | "myBookings"
  | "bookings"
  | "upcoming"
  | "history"
  | "favorites"
  | "workInvitations"
  | "notifications"
  | "profile"
  | "publicProfile"
  | "calendar"
  | "availability"
  | "services"
  | "reservations"
  | "tables"
  | "menu"
  | "team"
  | "business"
  | "locations"
  | "settings"
  | "analytics"
  | "audit"
  | "reviews"
  | "messages"
  | "admin"
  | "assistant"
  | "commerce"
  | "commerceStore"
  | "commerceAccess"
  | "commerceProducts"
  | "commerceInventory"
  | "commerceOrders"
  | "commerceReports";

export interface DashboardUser {
  id?: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface DashboardNavigationItem {
  title: DashboardNavigationItemKey;
  href: string;
  icon: LucideIcon;
  badge?: string;
  children?: DashboardNavigationItem[];
}

export interface DashboardNavigationGroup {
  label: DashboardNavigationGroupKey;
  items: DashboardNavigationItem[];
}
