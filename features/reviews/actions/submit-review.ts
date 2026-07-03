"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";

import { requireCustomerIdentity } from "@/features/identity/server";
import { reviewSchema } from "@/features/reviews/schemas/review";
import type { ReviewActionState } from "@/features/reviews/types";
import { prisma } from "@/lib/db/prisma";
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

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId: identity.person.id,
      status: "COMPLETED",
      review: null,
    },
    select: {
      id: true,
      customerId: true,
      organizationId: true,
      memberId: true,
      serviceNameSnapshot: true,
      customerNameSnapshot: true,
      branchService: { select: { serviceId: true } },
      organization: { select: { slug: true, name: true } },
    },
  });
  if (!booking) {
    return {
      status: "error",
      message: t("thisBookingCannotBeReviewed"),
    };
  }

  try {
    await prisma.$transaction([
      prisma.review.create({
        data: {
          bookingId: booking.id,
          customerId: booking.customerId,
          organizationId: booking.organizationId,
          serviceId: booking.branchService.serviceId,
          memberId: booking.memberId,
          rating: parsed.data.rating,
          comment: parsed.data.comment,
          status: "VISIBLE",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "BUSINESS",
          businessId: booking.organizationId,
          priority: "NORMAL",
          title: t("newReviewReceived"),
          body: t("newReviewNotificationBody", {
            customer: booking.customerNameSnapshot,
            service: booking.serviceNameSnapshot,
            rating: parsed.data.rating,
          }),
        },
      }),
    ]);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: t("alreadyReviewed"),
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
  revalidatePath(`/${booking.organization.slug}`);
  revalidatePath(`/businesses/${booking.organization.slug}`);

  return { status: "success", message: t("submitted") };
}
