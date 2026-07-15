import type {
  BookingChangeRequestStatus,
  BookingStatus,
  StaffSelectionMode,
} from "@prisma/client";

import type { ReviewEligibilityReason } from "@/features/reviews/domain/review-policy";
import type { CustomerReviewRecord } from "@/features/reviews/types";

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
  averageRating: number | null;
  reviewCount: number;
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

export interface CustomerBookingChangeRequest {
  id: string;
  direction: "BUSINESS_TO_CUSTOMER" | "CUSTOMER_TO_BUSINESS";
  status: BookingChangeRequestStatus;
  proposedStartsAt: string;
  proposedEndsAt: string;
  proposedMemberName: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface CustomerBookingManagementItem {
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
  cancellation: {
    eligible: boolean;
    deadline: string;
    cancelledAt: string | null;
  };
  changeRequest: CustomerBookingChangeRequest | null;
  reviewState: {
    eligible: boolean;
    reason: ReviewEligibilityReason;
    hasReview: boolean;
  };
}

export interface CustomerBookingManagementDetail
  extends CustomerBookingManagementItem {
  branchServiceId: string;
  memberId: string | null;
  cancellation: CustomerBookingManagementItem["cancellation"] & {
    reason: string | null;
  };
  reschedule: {
    eligible: boolean;
  };
  review: CustomerReviewRecord | null;
  statusHistory: Array<{
    id: string;
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    createdAt: string;
  }>;
}

export interface CustomerBookingPage {
  items: CustomerBookingManagementItem[];
  nextCursor: string | null;
  counts: {
    all: number;
    upcoming: number;
    completed: number;
    cancelled: number;
  };
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
  review?: {
    rating: number;
    comment: string | null;
    status: "VISIBLE" | "HIDDEN" | "FLAGGED";
    businessReply: string | null;
  } | null;
  pendingChange?: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    memberName: string | null;
    requestedByCustomer: boolean;
  } | null;
}

export type BookingLifecycleStatus =
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";
