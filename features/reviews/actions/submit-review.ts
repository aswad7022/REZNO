"use server";

import { revalidatePath } from "next/cache";

import { requireCustomerIdentity } from "@/features/identity/server";
import { reviewSchema } from "@/features/reviews/schemas/review";
import { prisma } from "@/lib/db/prisma";

export async function submitReview(
  bookingId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireCustomerIdentity();
  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return;

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
      branchService: { select: { serviceId: true } },
      organization: { select: { slug: true } },
    },
  });
  if (!booking) return;

  await prisma.review.create({
    data: {
      bookingId: booking.id,
      customerId: booking.customerId,
      organizationId: booking.organizationId,
      serviceId: booking.branchService.serviceId,
      memberId: booking.memberId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    },
  });

  revalidatePath("/customer/bookings");
  revalidatePath("/customer/notifications");
  revalidatePath(`/${booking.organization.slug}`);
  revalidatePath(`/businesses/${booking.organization.slug}`);
}
