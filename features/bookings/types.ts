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
  | "DATE_OUT_OF_RANGE"
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

export interface PublicBookingBusiness {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  categoryName: string | null;
  vertical: string;
  supportsServiceBooking: boolean;
}

export interface PublicBookingService {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryName: string;
  staffSelectionMode: StaffSelectionMode;
  branchCount: number;
  startingPrice: string;
  durationMinutes: number;
}

export interface PublicBookingBranch {
  branchServiceId: string;
  branchId: string;
  name: string;
  city: string | null;
  address: string | null;
  locationLabel: string | null;
  timezone: string;
  price: string;
  pricingType: string;
  durationMinutes: number;
  staffSelectionMode: StaffSelectionMode;
}

export interface PublicBookingStaffMember {
  id: string;
  name: string;
  photoUrl: string | null;
  specialties: string[];
}

export interface PersistedBookingDetail {
  id: string;
  reference: string;
  businessName: string;
  branchName: string;
  serviceName: string;
  memberName: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  price: string;
  status: BookingStatus;
  createdAt: string;
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
