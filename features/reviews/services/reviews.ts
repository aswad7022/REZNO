import "server-only";

import { requireBusinessIdentity } from "@/features/identity/server";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { canRespondToBusinessReview } from "@/features/reviews/domain/review-policy";
import { getPublicOrganizationReviewAggregates } from "@/features/reviews/services/review-lifecycle";
import { prisma } from "@/lib/db/prisma";

export async function getBusinessReviewsPageData() {
  await currentBusinessOperationReference("SETTINGS_READ");
  const { membership } = await requireBusinessIdentity();

  const [reviews, aggregates] = await Promise.all([
    prisma.review.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        status: true,
        businessReply: true,
        businessRepliedAt: true,
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
    getPublicOrganizationReviewAggregates([membership.organizationId]),
  ]);

  const aggregate = aggregates.get(membership.organizationId);

  return {
    reviews,
    averageRating: aggregate?.averageRating ?? null,
    visibleReviewCount: aggregate?.reviewCount ?? 0,
    canRespond: canRespondToBusinessReview(membership.role.systemRole),
  };
}
