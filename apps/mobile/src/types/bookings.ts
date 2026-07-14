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
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  createdAt: string;
};
