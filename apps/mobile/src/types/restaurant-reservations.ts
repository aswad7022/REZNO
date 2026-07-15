import type { MobileBusinessVertical } from "./marketplace";

export type MobileRestaurantBranch = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  timezone: string;
  supportsReservations: boolean;
};

export type MobileRestaurantBusiness = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  vertical: MobileBusinessVertical;
  supportsReservations: boolean;
  reservationDurationMinutes: number;
  reservationRangeDays: number;
  hasMenu: boolean;
  seatingAreas: string[];
  branches: MobileRestaurantBranch[];
};

export type MobileRestaurantMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
  preparationMinutes: number | null;
};

export type MobileRestaurantMenuCategory = {
  id: string;
  name: string;
  description: string | null;
  items: MobileRestaurantMenuItem[];
};

export type MobileRestaurantAvailability = {
  branch: { id: string; name: string };
  date: string;
  timezone: string;
  guestCount: number;
  seatingArea: string | null;
  seatingAreas: string[];
  durationMinutes: number;
  slots: Array<{ startsAt: string; endsAt: string }>;
  reason: "CAPACITY_UNAVAILABLE" | "NO_SLOTS" | "RESTAURANT_CLOSED" | null;
};

export type MobileRestaurantReservationDetail = {
  id: string;
  reference: string;
  restaurant: { name: string; slug: string };
  branch: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  timezone: string;
  guestCount: number;
  seatingArea: string | null;
  durationMinutes: number;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  customerNote: string | null;
  preorderTotal: string;
  preorderItems: Array<{
    id: string;
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: string;
    currency: string;
  }>;
  createdAt: string;
  updatedAt: string;
  cancellation: {
    eligible: boolean;
    deadline: string;
    cancelledAt: string | null;
    reason: string | null;
  };
  reschedule: { eligible: boolean; deadline: string };
  statusHistory: Array<{
    id: string;
    fromStatus: MobileRestaurantReservationDetail["status"] | null;
    toStatus: MobileRestaurantReservationDetail["status"];
    note: string | null;
    createdAt: string;
  }>;
};

export type MobileRestaurantReservationManagementTab =
  | "all"
  | "upcoming"
  | "completed"
  | "cancelled";

export type MobileManagedRestaurantReservation = Omit<
  MobileRestaurantReservationDetail,
  "cancellation" | "customerNote" | "preorderItems" | "statusHistory"
> & {
  cancellation: Omit<
    MobileRestaurantReservationDetail["cancellation"],
    "reason"
  >;
};

export type MobileRestaurantReservationManagementPage = {
  tab: MobileRestaurantReservationManagementTab;
  items: MobileManagedRestaurantReservation[];
  nextCursor: string | null;
  counts: Record<MobileRestaurantReservationManagementTab, number>;
};
