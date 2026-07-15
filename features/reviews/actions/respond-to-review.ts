"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireBusinessIdentity } from "@/features/identity/server";
import { businessReplyFormSchema } from "@/features/reviews/schemas/review";
import { respondToBusinessReview } from "@/features/reviews/services/review-lifecycle";
import { logServerError } from "@/lib/logging/server";

function reviewsRedirect(result: "success" | "error"): never {
  redirect(`/business/reviews?businessAction=${result}`);
}

export async function respondToReview(reviewId: string, formData: FormData) {
  const identity = await requireBusinessIdentity();
  const parsed = businessReplyFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) reviewsRedirect("error");

  try {
    await respondToBusinessReview({
      organizationId: identity.membership.organizationId,
      replyAuthorMemberId: identity.membership.id,
      reviewId,
      reply: parsed.data.reply,
    });
  } catch (error) {
    logServerError("business.review.reply", error, { reviewId });
    reviewsRedirect("error");
  }

  revalidatePath("/business/reviews");
  revalidatePath("/marketplace");
  revalidatePath(`/${identity.membership.organization.slug}`);
  revalidatePath(`/businesses/${identity.membership.organization.slug}`);
  reviewsRedirect("success");
}
