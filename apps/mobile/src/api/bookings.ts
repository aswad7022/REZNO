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
