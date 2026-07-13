export type MobileTabId =
  | "customerHome"
  | "marketplace"
  | "bookings"
  | "messages"
  | "business"
  | "account";

export type MobileTab = {
  id: MobileTabId;
  icon: string;
};

export const MOBILE_TABS: MobileTab[] = [
  { id: "customerHome", icon: "⌂" },
  { id: "marketplace", icon: "▦" },
  { id: "bookings", icon: "◷" },
  { id: "messages", icon: "✉" },
  { id: "business", icon: "▣" },
  { id: "account", icon: "◉" },
];
