import { mobileApiRequest } from "./client";
import type {
  MobileRestaurantAvailability,
  MobileRestaurantBranch,
  MobileRestaurantBusiness,
  MobileRestaurantMenuCategory,
  MobileRestaurantReservationDetail,
  MobileRestaurantReservationManagementPage,
  MobileRestaurantReservationManagementTab,
} from "../types/restaurant-reservations";

type DataResponse<T> = { data: T };

export function fetchMobileRestaurantBusiness(slug: string) {
  return mobileApiRequest<DataResponse<MobileRestaurantBusiness>>(
    `/api/mobile/restaurant-reservations/businesses/${encodeURIComponent(slug)}`,
  );
}

export function fetchMobileRestaurantBranches(slug: string) {
  return mobileApiRequest<DataResponse<MobileRestaurantBranch[]>>(
    `/api/mobile/restaurant-reservations/businesses/${encodeURIComponent(slug)}/branches`,
  );
}

export function fetchMobileRestaurantMenu(slug: string) {
  return mobileApiRequest<DataResponse<MobileRestaurantMenuCategory[]>>(
    `/api/mobile/restaurant-reservations/businesses/${encodeURIComponent(slug)}/menu`,
  );
}

export function fetchMobileRestaurantAvailability(input: {
  branchId: string;
  date: string;
  guestCount: number;
  seatingArea: string | null;
}) {
  return mobileApiRequest<DataResponse<MobileRestaurantAvailability>>(
    `/api/mobile/restaurant-reservations/branches/${encodeURIComponent(input.branchId)}/availability`,
    {
      params: {
        date: input.date,
        guestCount: input.guestCount,
        seatingArea: input.seatingArea ?? undefined,
      },
    },
  );
}

export function createMobileRestaurantReservation(
  input: {
    businessSlug: string;
    branchId: string;
    date: string;
    startsAt: string;
    guestCount: number;
    seatingArea: string | null;
    customerNote: string | null;
    preorderItems: Array<{ itemId: string; quantity: number }>;
  },
  idempotencyKey: string,
) {
  return mobileApiRequest<
    DataResponse<{ reservation: MobileRestaurantReservationDetail; replayed: boolean }>
  >("/api/mobile/restaurant-reservations", {
    authenticated: true,
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  });
}

export function fetchMobileRestaurantReservationDetail(bookingId: string) {
  return mobileApiRequest<DataResponse<MobileRestaurantReservationDetail>>(
    `/api/mobile/restaurant-reservations/${encodeURIComponent(bookingId)}`,
    { authenticated: true },
  );
}

export function fetchMobileManagedRestaurantReservations(input: {
  tab: MobileRestaurantReservationManagementTab;
  cursor?: string | null;
  limit?: number;
}) {
  return mobileApiRequest<DataResponse<MobileRestaurantReservationManagementPage>>(
    "/api/mobile/restaurant-reservations",
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

export function cancelMobileRestaurantReservation(
  bookingId: string,
  reason: string,
  idempotencyKey: string,
) {
  return mobileApiRequest<
    DataResponse<{
      reservation: MobileRestaurantReservationDetail;
      replayed: boolean;
    }>
  >(`/api/mobile/restaurant-reservations/${encodeURIComponent(bookingId)}/cancel`, {
    authenticated: true,
    body: { reason },
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  });
}

export function fetchMobileRestaurantRescheduleOptions(input: {
  bookingId: string;
  date: string;
  guestCount: number;
  seatingArea: string | null;
}) {
  return mobileApiRequest<DataResponse<MobileRestaurantAvailability>>(
    `/api/mobile/restaurant-reservations/${encodeURIComponent(input.bookingId)}/reschedule-options`,
    {
      authenticated: true,
      params: {
        date: input.date,
        guestCount: input.guestCount,
        seatingArea: input.seatingArea ?? undefined,
      },
    },
  );
}

export function rescheduleMobileRestaurantReservation(
  bookingId: string,
  input: {
    customerNote: string | null;
    date: string;
    guestCount: number;
    seatingArea: string | null;
    startsAt: string;
  },
  idempotencyKey: string,
) {
  return mobileApiRequest<
    DataResponse<{
      reservation: MobileRestaurantReservationDetail;
      replayed: boolean;
    }>
  >(`/api/mobile/restaurant-reservations/${encodeURIComponent(bookingId)}/reschedule`, {
    authenticated: true,
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  });
}
