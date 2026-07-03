import "server-only";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { prisma } from "@/lib/db/prisma";

export async function getAdminReviewsPageData() {
  await requireAdminPermission("BUSINESSES_VIEW");

  return prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      rating: true,
      comment: true,
      status: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          displayName: true,
        },
      },
      booking: {
        select: {
          id: true,
          serviceNameSnapshot: true,
          startsAt: true,
          status: true,
        },
      },
    },
  });
}
