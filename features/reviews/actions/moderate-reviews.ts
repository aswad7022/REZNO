"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAdminAuditEvent } from "@/features/admin/services/admin-audit";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { prisma } from "@/lib/db/prisma";
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

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      organization: { select: { slug: true } },
    },
  });

  if (!review) {
    adminReviewsRedirect("error");
  }

  try {
    await prisma.review.update({
      where: { id: review.id },
      data: { status: parsed.data.status },
    });

    await logAdminAuditEvent({
      adminUserId: identity.session.user.id,
      action:
        parsed.data.status === "VISIBLE"
          ? "admin.review.unhide"
          : "admin.review.hide",
      targetType: "review",
      targetId: review.id,
      metadata: {
        previousStatus: review.status,
        nextStatus: parsed.data.status,
        organizationId: review.organizationId,
      },
    });
  } catch (error) {
    logServerError("admin.review.visibility", error, { reviewId });
    adminReviewsRedirect("error");
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/marketplace");
  revalidatePath(`/${review.organization.slug}`);
  revalidatePath(`/businesses/${review.organization.slug}`);
  adminReviewsRedirect("success");
}
