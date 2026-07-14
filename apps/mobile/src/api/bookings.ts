import { mobileApiRequest } from "./client";
import type {
  MobileBookingAvailability,
  MobileBookingBranch,
  MobileBookingBusiness,
  MobileBookingService,
  MobileBookingStaff,
  MobilePersistedBooking,
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
  return mobileApiRequest<DataResponse<MobilePersistedBooking>>(
    `/api/mobile/bookings/${encodeURIComponent(bookingId)}`,
    { authenticated: true },
  );
}
