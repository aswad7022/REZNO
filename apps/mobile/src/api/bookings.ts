import { mobileApiRequest } from "./client";
import type {
  MobileBookingAvailability,
  MobileBookingBranch,
  MobileBookingBusiness,
  MobileBookingService,
  MobileBookingStaff,
  MobilePersistedBooking,
  MobileBookingManagementPage,
  MobileBookingManagementTab,
  MobileManagedBookingDetail,
  MobileBookingReviewState,
  MobileStaffSelectionMode,
} from "../types/bookings";

type DataResponse<T> = { data: T };

export function fetchMobileBookingBusiness(slug: string) {
  return mobileApiRequest<DataResponse<MobileBookingBusiness>>(
    `/api/mobile/bookings/businesses/${encodeURIComponent(slug)}`,
  );
}

export function fetchMobileBookingServices(slug: string) {
  return mobileApiRequest<DataResponse<MobileBookingService[]>>(
    `/api/mobile/bookings/businesses/${encodeURIComponent(slug)}/services`,
  );
}

export function fetchMobileBookingBranches(slug: string, serviceId: string) {
  return mobileApiRequest<DataResponse<MobileBookingBranch[]>>(
    `/api/mobile/bookings/businesses/${encodeURIComponent(slug)}/services/${encodeURIComponent(serviceId)}/branches`,
  );
}

export function fetchMobileBookingStaff(branchServiceId: string) {
  return mobileApiRequest<
    DataResponse<{
      staffSelectionMode: MobileStaffSelectionMode;
      staff: MobileBookingStaff[];
    }>
  >(
    `/api/mobile/bookings/offerings/${encodeURIComponent(branchServiceId)}/staff`,
  );
}

export function fetchMobileBookingAvailability(input: {
  branchServiceId: string;
  date: string;
  memberId: string | null;
}) {
  return mobileApiRequest<DataResponse<MobileBookingAvailability>>(
    `/api/mobile/bookings/offerings/${encodeURIComponent(input.branchServiceId)}/availability`,
    {
      params: {
        date: input.date,
        memberId: input.memberId ?? undefined,
      },
    },
  );
}

export function createMobileBooking(
  input: {
    branchServiceId: string;
    date: string;
    memberId: string | null;
    startsAt: string;
  },
  idempotencyKey: string,
) {
  return mobileApiRequest<
    DataResponse<{ booking: MobilePersistedBooking; replayed: boolean }>
  >("/api/mobile/bookings", {
    authenticated: true,
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  });
}

export function fetchMobileBookingDetail(bookingId: string) {
  return mobileApiRequest<DataResponse<MobileManagedBookingDetail>>(
    `/api/mobile/bookings/${encodeURIComponent(bookingId)}`,
    { authenticated: true },
  );
}

export function fetchMobileManagedBookings(input: {
  tab: MobileBookingManagementTab;
  cursor?: string | null;
  limit?: number;
}) {
  return mobileApiRequest<DataResponse<MobileBookingManagementPage>>(
    "/api/mobile/bookings",
    {
      authenticated: true,
      params: {
        tab: input.tab,
        cursor: input.cursor ?? undefined,
        limit: input.limit,
      },
    },
  );
}

export function cancelMobileBooking(
  bookingId: string,
  reason: string,
  idempotencyKey: string,
) {
  return mobileApiRequest<
    DataResponse<{ booking: MobileManagedBookingDetail; replayed: boolean }>
  >(`/api/mobile/bookings/${encodeURIComponent(bookingId)}/cancel`, {
    authenticated: true,
    body: { reason },
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  });
}

export function fetchMobileBookingRescheduleOptions(input: {
  bookingId: string;
  date: string;
  memberId: string | null;
}) {
  return mobileApiRequest<DataResponse<MobileBookingAvailability>>(
    `/api/mobile/bookings/${encodeURIComponent(input.bookingId)}/reschedule-options`,
    {
      authenticated: true,
      params: {
        date: input.date,
        memberId: input.memberId ?? undefined,
      },
    },
  );
}

export function requestMobileBookingChange(
  bookingId: string,
  input: { date: string; memberId: string | null; startsAt: string },
  idempotencyKey: string,
) {
  return mobileApiRequest<
    DataResponse<{ booking: MobileManagedBookingDetail; replayed: boolean }>
  >(`/api/mobile/bookings/${encodeURIComponent(bookingId)}/change-request`, {
    authenticated: true,
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  });
}

export function fetchMobileBookingReview(bookingId: string) {
  return mobileApiRequest<DataResponse<MobileBookingReviewState>>(
    `/api/mobile/bookings/${encodeURIComponent(bookingId)}/review`,
    { authenticated: true },
  );
}

export function submitMobileBookingReview(
  bookingId: string,
  input: { rating: number; comment: string | null },
) {
  return mobileApiRequest<
    DataResponse<{ review: MobileBookingReviewState["review"]; replayed: boolean }>
  >(`/api/mobile/bookings/${encodeURIComponent(bookingId)}/review`, {
    authenticated: true,
    body: input,
    method: "POST",
  });
}

export function fetchMobilePublicBusinessReviews(input: {
  slug: string;
  cursor?: string | null;
  limit?: number;
}) {
  return mobileApiRequest<
    DataResponse<{
      summary: {
        averageRating: number | null;
        reviewCount: number;
        ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
      };
      reviews: Array<{
        id: string;
        rating: number;
        comment: string | null;
        createdAt: string;
        customerName: string;
        serviceName: string;
        businessReply: string | null;
        businessRepliedAt: string | null;
      }>;
      nextCursor: string | null;
    }>
  >(`/api/mobile/bookings/businesses/${encodeURIComponent(input.slug)}/reviews`, {
    params: { cursor: input.cursor ?? undefined, limit: input.limit },
  });
}
