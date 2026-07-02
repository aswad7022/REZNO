import type {
  BookingStatus,
  StaffSelectionMode,
} from "@prisma/client";

export interface BookingSlot {
  startsAt: string;
  endsAt: string;
  memberId: string | null;
  memberName: string | null;
}

export type BookingSlotReason =
  | "AVAILABLE"
  | "INVALID_DATE"
  | "SERVICE_NOT_ASSIGNED"
  | "SERVICE_INACTIVE"
  | "OFFERING_UNAVAILABLE"
  | "HOURS_NOT_CONFIGURED"
  | "CLOSED_ON_DATE"
  | "STAFF_NOT_CONFIGURED"
  | "STAFF_UNAVAILABLE"
  | "NO_SLOTS";

export interface BookingSlotResult {
  slots: BookingSlot[];
  reason: BookingSlotReason;
}

export interface PublicOffering {
  id: string;
  organizationName: string;
  branchName: string;
  serviceName: string;
  description: string | null;
  price: string;
  durationMinutes: number;
  timezone: string;
  staffSelectionMode: StaffSelectionMode;
}

export interface BookingListItem {
  id: string;
  serviceName: string;
  customerName: string;
  branchName: string;
  businessName: string;
  contactPhone: string | null;
  memberName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  price: string;
  timezone: string;
  restaurantReservation?: {
    guestCount: number;
    tableName: string;
    seatingArea: string | null;
    items: Array<{
      name: string;
      quantity: number;
    }>;
  } | null;
  canCustomerCancel?: boolean;
  canCustomerReschedule?: boolean;
  canCustomerReview?: boolean;
  review?: { rating: number; comment: string | null } | null;
  pendingChange?: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    memberName: string | null;
  } | null;
}

export type BookingLifecycleStatus =
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";
