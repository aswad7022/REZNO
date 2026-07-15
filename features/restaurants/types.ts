import type { BookingStatus } from "@prisma/client";

import type { CustomerRestaurantReservationTab } from "@/features/restaurants/domain/reservation-management";

export type RestaurantReservationPreorderSnapshot = {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  currency: string;
};

export type CustomerRestaurantReservationItem = {
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
  status: BookingStatus;
  preorderTotal: string;
  createdAt: string;
  updatedAt: string;
  cancellation: {
    eligible: boolean;
    deadline: string;
    cancelledAt: string | null;
  };
  reschedule: { eligible: boolean; deadline: string };
};

export type CustomerRestaurantReservationDetail =
  CustomerRestaurantReservationItem & {
    customerNote: string | null;
    preorderItems: RestaurantReservationPreorderSnapshot[];
    cancellation: CustomerRestaurantReservationItem["cancellation"] & {
      reason: string | null;
    };
    statusHistory: Array<{
      id: string;
      fromStatus: BookingStatus | null;
      toStatus: BookingStatus;
      note: string | null;
      createdAt: string;
    }>;
  };

export type CustomerRestaurantReservationPage = {
  tab: CustomerRestaurantReservationTab;
  items: CustomerRestaurantReservationItem[];
  nextCursor: string | null;
  counts: {
    all: number;
    upcoming: number;
    completed: number;
    cancelled: number;
  };
};
