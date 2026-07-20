export type MobileStaffSelectionMode = "NONE" | "OPTIONAL" | "REQUIRED";

export type MobileBookingBusiness = {
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
};

export type MobileBookingService = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryName: string;
  staffSelectionMode: MobileStaffSelectionMode;
  branchCount: number;
  startingPrice: string;
  durationMinutes: number;
};

export type MobileBookingBranch = {
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
  staffSelectionMode: MobileStaffSelectionMode;
};

export type MobileBookingStaff = {
  id: string;
  name: string;
  photoUrl: string | null;
  specialties: string[];
};

export type MobileBookingSlot = {
  startsAt: string;
  endsAt: string;
  memberId: string | null;
  memberName: string | null;
};

export type MobileBookingAvailability = {
  date: string;
  timezone: string;
  staffSelectionMode: MobileStaffSelectionMode;
  reason: string;
  slots: MobileBookingSlot[];
};

export type MobilePersistedBooking = {
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
  currency: string;
  paymentMethod: "CASH_ON_DELIVERY" | "PAY_AT_PICKUP" | "ONLINE_PROVIDER" | null;
  paymentStatus: "UNPAID" | "PAID" | "VOIDED" | "PARTIALLY_REFUNDED" | "REFUNDED";
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  createdAt: string;
};

export type MobileBookingStatus = MobilePersistedBooking["status"];
export type MobileReviewStatus = "VISIBLE" | "HIDDEN" | "FLAGGED";
export type MobileReviewEligibilityReason =
  | "ELIGIBLE"
  | "ALREADY_REVIEWED"
  | "BOOKING_NOT_COMPLETED"
  | "RELATED_RECORDS_INVALID"
  | "RESTAURANT_FLOW_EXCLUDED";

export type MobileCustomerReview = {
  id: string;
  rating: number;
  comment: string | null;
  status: MobileReviewStatus;
  createdAt: string;
  updatedAt: string;
  businessReply: string | null;
  businessRepliedAt: string | null;
};

export type MobileBookingReviewState = {
  booking: { id: string; reference: string; status: MobileBookingStatus };
  eligibility: { eligible: boolean; reason: MobileReviewEligibilityReason };
  review: MobileCustomerReview | null;
};
export type MobileBookingManagementTab =
  | "all"
  | "upcoming"
  | "completed"
  | "cancelled";

export type MobileBookingChangeRequest = {
  id: string;
  direction: "BUSINESS_TO_CUSTOMER" | "CUSTOMER_TO_BUSINESS";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  proposedStartsAt: string;
  proposedEndsAt: string;
  proposedMemberName: string | null;
  createdAt: string;
  respondedAt: string | null;
};

export type MobileManagedBooking = MobilePersistedBooking & {
  cancellation: {
    eligible: boolean;
    deadline: string;
    cancelledAt: string | null;
  };
  changeRequest: MobileBookingChangeRequest | null;
  reviewState: {
    eligible: boolean;
    reason: MobileReviewEligibilityReason;
    hasReview: boolean;
  };
};

export type MobileManagedBookingDetail = MobileManagedBooking & {
  branchServiceId: string;
  memberId: string | null;
  cancellation: MobileManagedBooking["cancellation"] & {
    reason: string | null;
  };
  reschedule: { eligible: boolean };
  review: MobileCustomerReview | null;
  statusHistory: Array<{
    id: string;
    fromStatus: MobileBookingStatus | null;
    toStatus: MobileBookingStatus;
    createdAt: string;
  }>;
};

export type MobileBookingManagementPage = {
  items: MobileManagedBooking[];
  nextCursor: string | null;
  counts: Record<MobileBookingManagementTab, number>;
};
