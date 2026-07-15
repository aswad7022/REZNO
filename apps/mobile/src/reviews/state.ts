import type { MobileBookingReviewState } from "../types/bookings";

export type MobileReviewUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "eligible"; data: MobileBookingReviewState }
  | { status: "ineligible"; data: MobileBookingReviewState }
  | { status: "existing"; data: MobileBookingReviewState }
  | { status: "submitting"; data: MobileBookingReviewState }
  | { status: "success"; data: MobileBookingReviewState; replayed: boolean }
  | { status: "error"; message: string }
  | { status: "session-expired" };

export function reviewStateFromAuthoritative(
  data: MobileBookingReviewState,
): MobileReviewUiState {
  if (data.review) return { status: "existing", data };
  return data.eligibility.eligible
    ? { status: "eligible", data }
    : { status: "ineligible", data };
}

export function createMobileReviewSubmissionGate() {
  let pending = false;
  return {
    tryBegin() {
      if (pending) return false;
      pending = true;
      return true;
    },
    finish() {
      pending = false;
    },
    isPending() {
      return pending;
    },
  };
}

export function mobileReviewFailure(code?: string) {
  return {
    sessionExpired: [
      "CUSTOMER_UNAVAILABLE",
      "PROFILE_INCOMPLETE",
      "PROFILE_UNAVAILABLE",
      "UNAUTHENTICATED",
    ].includes(code ?? ""),
    conflict: code === "REVIEW_CONFLICT",
    validation: code === "INVALID_REQUEST",
  };
}
