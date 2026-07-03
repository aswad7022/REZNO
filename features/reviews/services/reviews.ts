import "server-only";

import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

export async function getBusinessReviewsPageData() {
  const { membership } = await requireBusinessIdentity();

  const [reviews, aggregate] = await Promise.all([
    prisma.review.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        status: true,
        createdAt: true,
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
    }),
    prisma.review.aggregate({
      where: { organizationId: membership.organizationId, status: "VISIBLE" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  return {
    reviews,
    averageRating: aggregate._avg.rating ?? null,
    visibleReviewCount: aggregate._count._all,
  };
}
