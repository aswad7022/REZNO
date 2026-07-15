"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireCustomerIdentity } from "@/features/identity/server";
import { reviewSchema } from "@/features/reviews/schemas/review";
import { ReviewDomainError } from "@/features/reviews/domain/errors";
import { createOrReplayCustomerReview } from "@/features/reviews/services/review-lifecycle";
import type { ReviewActionState } from "@/features/reviews/types";
import { logServerError } from "@/lib/logging/server";

export async function submitReview(
  bookingId: string,
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const [identity, t] = await Promise.all([
    requireCustomerIdentity(),
    getTranslations("Reviews"),
  ]);
  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: t("invalidReview") };
  }

  let organizationSlug: string;
  try {
    const result = await createOrReplayCustomerReview({
      bookingId,
      customerId: identity.person.id,
      review: parsed.data,
    });
    organizationSlug = result.organizationSlug;
  } catch (error) {
    if (error instanceof ReviewDomainError) {
      return {
        status: "error",
        message:
          error.code === "REVIEW_CONFLICT"
            ? t("alreadyReviewed")
            : t("thisBookingCannotBeReviewed"),
      };
    }

    logServerError("review.submit", error, {
      bookingId,
      customerId: identity.person.id,
    });
    return {
      status: "error",
      message: t("couldNotSubmit"),
    };
  }

  revalidatePath("/customer/bookings");
  revalidatePath("/customer/notifications");
  revalidatePath("/business/reviews");
  revalidatePath("/business/notifications");
  revalidatePath("/marketplace");
  revalidatePath(`/${organizationSlug}`);
  revalidatePath(`/businesses/${organizationSlug}`);

  return { status: "success", message: t("submitted") };
}
