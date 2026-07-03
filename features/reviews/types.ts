export interface ReviewActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialReviewActionState: ReviewActionState = { status: "idle" };
