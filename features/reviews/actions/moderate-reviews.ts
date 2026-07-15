"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { moderateReview } from "@/features/reviews/services/review-lifecycle";
import { logServerError } from "@/lib/logging/server";

const reviewVisibilitySchema = z.object({
  status: z.enum(["VISIBLE", "HIDDEN"]),
});

function adminReviewsRedirect(result: "success" | "error"): never {
  redirect(`/admin/reviews?adminAction=${result}`);
}

export async function updateReviewVisibility(
  reviewId: string,
  formData: FormData,
) {
  const identity = (await requireAdminPermission("BUSINESSES_MANAGE")).identity;
  const parsed = reviewVisibilitySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    adminReviewsRedirect("error");
  }

  let organizationSlug: string;
  try {
    const result = await moderateReview({
      adminUserId: identity.session.user.id,
      reviewId,
      status: parsed.data.status,
    });
    organizationSlug = result.organization.slug;
  } catch (error) {
    logServerError("admin.review.visibility", error, { reviewId });
    adminReviewsRedirect("error");
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/marketplace");
  revalidatePath(`/${organizationSlug}`);
  revalidatePath(`/businesses/${organizationSlug}`);
  adminReviewsRedirect("success");
}
