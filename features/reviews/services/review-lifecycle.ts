import "server-only";

import { Prisma, type ReviewStatus } from "@prisma/client";

import { bookingReference } from "@/features/bookings/domain/creation";
import {
  assertModerationTransition,
  assertReviewResponseRole,
  businessReplyInputSchema,
  decodePublicReviewCursor,
  DEFAULT_PUBLIC_REVIEW_PAGE_SIZE,
  encodePublicReviewCursor,
  evaluateReviewEligibility,
  isPublicReviewRelationshipValid,
  MAX_PUBLIC_REVIEW_PAGE_SIZE,
  publicReviewCursorWhere,
  reviewPayloadsEqual,
  reviewInputSchema,
  roundPublicRating,
  type NormalizedReviewInput,
} from "@/features/reviews/domain/review-policy";
import { reviewDomainError } from "@/features/reviews/domain/errors";
import type {
  CustomerBookingReviewState,
  CustomerReviewRecord,
  PublicReviewSummary,
} from "@/features/reviews/types";
import { prisma } from "@/lib/db/prisma";

const publicOrganizationWhere = {
  deletedAt: null,
  isActive: true,
  status: "ACTIVE" as const,
  settings: { bookingEnabled: true, marketplaceVisible: true },
};

const customerReviewSelect = Prisma.validator<Prisma.ReviewSelect>()({
  id: true,
  rating: true,
  comment: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  businessReply: true,
  businessRepliedAt: true,
});

export function serializeCustomerReview(
  review: Prisma.ReviewGetPayload<{ select: typeof customerReviewSelect }>,
): CustomerReviewRecord {
  const exposeReply = review.status === "VISIBLE";
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    businessReply: exposeReply ? review.businessReply : null,
    businessRepliedAt:
      exposeReply ? review.businessRepliedAt?.toISOString() ?? null : null,
  };
}

const customerBookingReviewInclude = Prisma.validator<Prisma.BookingInclude>()({
  branch: { select: { organizationId: true } },
  branchService: {
    select: {
      branchId: true,
      serviceId: true,
      service: { select: { organizationId: true } },
    },
  },
  member: { select: { organizationId: true } },
  organization: { select: { slug: true, vertical: true } },
  restaurantReservation: { select: { id: true } },
  review: { select: customerReviewSelect },
});

type CustomerReviewBooking = Prisma.BookingGetPayload<{
  include: typeof customerBookingReviewInclude;
}>;

function relationshipsAreValid(booking: CustomerReviewBooking) {
  if (!booking.branchService || !booking.branchServiceId) return false;
  return (
    booking.branch.organizationId === booking.organizationId &&
    booking.branchService.branchId === booking.branchId &&
    booking.branchService.service.organizationId === booking.organizationId &&
    (!booking.member || booking.member.organizationId === booking.organizationId)
  );
}

function serializeReviewState(
  booking: CustomerReviewBooking,
): CustomerBookingReviewState {
  return {
    booking: {
      id: booking.id,
      reference: bookingReference(booking.id),
      status: booking.status,
    },
    eligibility: evaluateReviewEligibility({
      bookingStatus: booking.status,
      businessVertical: booking.organization.vertical,
      hasRestaurantReservation: Boolean(booking.restaurantReservation),
      hasReview: Boolean(booking.review),
      relationshipsValid: relationshipsAreValid(booking),
    }),
    review: booking.review ? serializeCustomerReview(booking.review) : null,
  };
}

async function assertActiveCustomer(
  database: Prisma.TransactionClient | typeof prisma,
  customerId: string,
) {
  const customer = await database.person.findFirst({
    where: {
      id: customerId,
      deletedAt: null,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!customer) {
    reviewDomainError(
      "CUSTOMER_UNAVAILABLE",
      "An active, onboarded customer profile is required.",
    );
  }
}

export async function getCustomerBookingReviewState(
  customerId: string,
  bookingId: string,
): Promise<CustomerBookingReviewState | null> {
  await assertActiveCustomer(prisma, customerId);
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
    include: customerBookingReviewInclude,
  });
  return booking ? serializeReviewState(booking) : null;
}

export async function createOrReplayCustomerReview(input: {
  bookingId: string;
  customerId: string;
  review: NormalizedReviewInput;
}) {
  const parsedReview = reviewInputSchema.safeParse(input.review);
  if (!parsedReview.success) {
    reviewDomainError("INVALID_REQUEST", "Review payload is invalid.");
  }
  const reviewInput = parsedReview.data;
  try {
    return await prisma.$transaction(async (transaction) => {
      await assertActiveCustomer(transaction, input.customerId);
      const booking = await transaction.booking.findFirst({
        where: { id: input.bookingId, customerId: input.customerId },
        include: customerBookingReviewInclude,
      });
      if (!booking) reviewDomainError("NOT_FOUND", "Booking was not found.");

      if (booking.review) {
        if (reviewPayloadsEqual(booking.review, reviewInput)) {
          return {
            review: serializeCustomerReview(booking.review),
            replayed: true,
            organizationSlug: booking.organization.slug,
          };
        }
        reviewDomainError(
          "REVIEW_CONFLICT",
          "This booking already has a different review.",
        );
      }

      const eligibility = evaluateReviewEligibility({
        bookingStatus: booking.status,
        businessVertical: booking.organization.vertical,
        hasRestaurantReservation: Boolean(booking.restaurantReservation),
        hasReview: false,
        relationshipsValid: relationshipsAreValid(booking),
      });
      if (!eligibility.eligible) {
        reviewDomainError(
          "BOOKING_NOT_REVIEWABLE",
          "This booking is not eligible for a service review.",
          { reason: eligibility.reason },
        );
      }
      if (!booking.branchService || !booking.branchServiceId) {
        reviewDomainError(
          "BOOKING_NOT_REVIEWABLE",
          "This booking does not have a generic service relationship.",
        );
      }

      const review = await transaction.review.create({
        data: {
          bookingId: booking.id,
          customerId: booking.customerId,
          organizationId: booking.organizationId,
          serviceId: booking.branchService.serviceId,
          memberId: booking.memberId,
          rating: reviewInput.rating,
          comment: reviewInput.comment,
          status: "VISIBLE",
        },
        select: customerReviewSelect,
      });
      await transaction.notification.create({
        data: {
          audience: "BUSINESS",
          businessId: booking.organizationId,
          priority: "NORMAL",
          title: "New review received",
          body: `${booking.customerNameSnapshot} rated ${booking.serviceNameSnapshot} ${reviewInput.rating}/5.`,
        },
      });
      return {
        review: serializeCustomerReview(review),
        replayed: false,
        organizationSlug: booking.organization.slug,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.review.findFirst({
        where: { bookingId: input.bookingId, customerId: input.customerId },
        select: {
          ...customerReviewSelect,
          booking: { select: { organization: { select: { slug: true } } } },
        },
      });
      if (existing && reviewPayloadsEqual(existing, reviewInput)) {
        return {
          review: serializeCustomerReview(existing),
          replayed: true,
          organizationSlug: existing.booking.organization.slug,
        };
      }
      if (existing) {
        reviewDomainError(
          "REVIEW_CONFLICT",
          "This booking already has a different review.",
        );
      }
    }
    throw error;
  }
}

function publicReviewCandidateWhere(organizationId: string): Prisma.ReviewWhereInput {
  return {
    organizationId,
    status: "VISIBLE",
    rating: { gte: 1, lte: 5 },
    organization: { vertical: { notIn: ["RESTAURANT", "CAFE"] } },
    booking: {
      restaurantReservation: { is: null },
    },
  };
}

function aggregateRows(rows: PublicReviewRelationshipRow[]): PublicReviewSummary {
  const valid = rows.filter(isPublicReviewRelationshipValid);
  const distribution: PublicReviewSummary["ratingDistribution"] = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
  let total = 0;
  for (const row of valid) {
    distribution[String(row.rating) as keyof typeof distribution] += 1;
    total += row.rating;
  }
  return {
    averageRating: roundPublicRating(valid.length ? total / valid.length : null),
    reviewCount: valid.length,
    ratingDistribution: distribution,
  };
}

const aggregateRowSelect = Prisma.validator<Prisma.ReviewSelect>()({
  bookingId: true,
  customerId: true,
  organizationId: true,
  serviceId: true,
  memberId: true,
  rating: true,
  status: true,
  organization: { select: { vertical: true } },
  service: { select: { organizationId: true } },
  member: { select: { organizationId: true } },
  booking: {
    select: {
      id: true,
      branchId: true,
      customerId: true,
      organizationId: true,
      memberId: true,
      branch: { select: { organizationId: true } },
      branchService: {
        select: {
          branchId: true,
          serviceId: true,
          service: { select: { organizationId: true } },
        },
      },
      member: { select: { organizationId: true } },
      restaurantReservation: { select: { id: true } },
    },
  },
});

type PublicReviewRelationshipRow = Prisma.ReviewGetPayload<{
  select: typeof aggregateRowSelect;
}>;

const publicReviewListSelect = Prisma.validator<Prisma.ReviewSelect>()({
  ...aggregateRowSelect,
  id: true,
  comment: true,
  createdAt: true,
  businessReply: true,
  businessRepliedAt: true,
  customer: { select: { firstName: true, displayName: true } },
  booking: {
    select: {
      ...aggregateRowSelect.booking.select,
      serviceNameSnapshot: true,
    },
  },
});

type PublicReviewListRow = Prisma.ReviewGetPayload<{
  select: typeof publicReviewListSelect;
}>;

const PUBLIC_REVIEW_SCAN_BATCH_SIZE = 100;

async function scanPublicReviewPage(input: {
  organizationId: string;
  cursor: ReturnType<typeof decodePublicReviewCursor> | null;
  validRowTarget: number;
}) {
  const validRows: PublicReviewListRow[] = [];
  let scanCursor = input.cursor;

  while (validRows.length < input.validRowTarget) {
    const batch = await prisma.review.findMany({
      where: {
        AND: [
          publicReviewCandidateWhere(input.organizationId),
          ...(scanCursor ? [publicReviewCursorWhere(scanCursor)] : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PUBLIC_REVIEW_SCAN_BATCH_SIZE,
      select: publicReviewListSelect,
    });

    for (const review of batch) {
      if (isPublicReviewRelationshipValid(review)) validRows.push(review);
      if (validRows.length === input.validRowTarget) break;
    }
    if (
      validRows.length === input.validRowTarget ||
      batch.length < PUBLIC_REVIEW_SCAN_BATCH_SIZE
    ) break;

    const lastScanned = batch.at(-1);
    if (!lastScanned) break;
    scanCursor = {
      organizationId: input.organizationId,
      createdAt: lastScanned.createdAt.toISOString(),
      id: lastScanned.id,
    };
  }

  return validRows;
}

export async function getPublicOrganizationReviewAggregates(
  organizationIds: string[],
) {
  const ids = [...new Set(organizationIds)].filter(Boolean);
  if (ids.length === 0) return new Map<string, PublicReviewSummary>();
  const rows = await prisma.review.findMany({
    where: {
      organizationId: { in: ids },
      status: "VISIBLE",
      rating: { gte: 1, lte: 5 },
      organization: { vertical: { notIn: ["RESTAURANT", "CAFE"] } },
      booking: { restaurantReservation: { is: null } },
    },
    select: aggregateRowSelect,
  });
  return new Map(
    ids.map((id) => [
      id,
      aggregateRows(rows.filter((row) => row.organizationId === id)),
    ]),
  );
}

export async function getPublicServiceReviewAggregates(
  services: Array<{ organizationId: string; serviceId: string }>,
) {
  const scopes = [...new Map(services.map((item) => [`${item.organizationId}:${item.serviceId}`, item])).values()];
  if (scopes.length === 0) return new Map<string, PublicReviewSummary>();
  const rows = await prisma.review.findMany({
    where: {
      status: "VISIBLE",
      rating: { gte: 1, lte: 5 },
      OR: scopes.map((scope) => ({
        organizationId: scope.organizationId,
        serviceId: scope.serviceId,
        organization: { vertical: { notIn: ["RESTAURANT", "CAFE"] } },
        booking: { organizationId: scope.organizationId, restaurantReservation: { is: null } },
      })),
    },
    select: aggregateRowSelect,
  });
  return new Map(
    scopes.map((scope) => {
      const key = `${scope.organizationId}:${scope.serviceId}`;
      return [key, aggregateRows(rows.filter((row) => `${row.organizationId}:${row.serviceId}` === key))];
    }),
  );
}

export async function getPublicMemberReviewAggregate(
  organizationId: string,
  memberId: string,
) {
  const rows = await prisma.review.findMany({
    where: { ...publicReviewCandidateWhere(organizationId), memberId },
    select: aggregateRowSelect,
  });
  return aggregateRows(rows);
}

export async function listPublicBusinessReviews(input: {
  slug: string;
  cursor?: string | null;
  limit?: number;
}) {
  const organization = await prisma.organization.findFirst({
    where: {
      slug: input.slug,
      ...publicOrganizationWhere,
      vertical: { notIn: ["RESTAURANT", "CAFE"] },
    },
    select: { id: true, slug: true },
  });
  if (!organization) reviewDomainError("NOT_FOUND", "Business was not found.");
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_PUBLIC_REVIEW_PAGE_SIZE, 1),
    MAX_PUBLIC_REVIEW_PAGE_SIZE,
  );
  const cursor = input.cursor
    ? decodePublicReviewCursor(input.cursor, organization.id)
    : null;
  const [rows, aggregateRowsData] = await Promise.all([
    scanPublicReviewPage({
      organizationId: organization.id,
      cursor,
      validRowTarget: limit + 1,
    }),
    prisma.review.findMany({
      where: publicReviewCandidateWhere(organization.id),
      select: aggregateRowSelect,
    }),
  ]);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    business: organization,
    summary: aggregateRows(aggregateRowsData),
    reviews: pageRows.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      customerName: review.customer.displayName ?? review.customer.firstName,
      serviceName: review.booking.serviceNameSnapshot,
      businessReply: review.businessReply,
      businessRepliedAt: review.businessRepliedAt?.toISOString() ?? null,
    })),
    nextCursor:
      hasMore && last
        ? encodePublicReviewCursor({
            organizationId: organization.id,
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
  };
}

export async function respondToBusinessReview(input: {
  organizationId: string;
  replyAuthorMemberId: string;
  reviewId: string;
  reply: string;
}) {
  const parsedReply = businessReplyInputSchema.safeParse({ reply: input.reply });
  if (!parsedReply.success) {
    reviewDomainError("INVALID_REQUEST", "Business reply is invalid.");
  }
  const member = await prisma.organizationMember.findFirst({
    where: {
      id: input.replyAuthorMemberId,
      organizationId: input.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      role: { organizationId: input.organizationId },
    },
    select: { id: true, role: { select: { systemRole: true } } },
  });
  if (!member) reviewDomainError("FORBIDDEN", "Business membership is unavailable.");
  assertReviewResponseRole(member.role.systemRole);
  const review = await prisma.review.findFirst({
    where: { id: input.reviewId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!review) reviewDomainError("NOT_FOUND", "Review was not found.");
  const repliedAt = new Date();
  return prisma.review.update({
    where: { id: review.id },
    data: {
      businessReply: parsedReply.data.reply,
      businessReplyAuthorId: member.id,
      businessRepliedAt: repliedAt,
    },
    select: { id: true, businessReply: true, businessRepliedAt: true },
  });
}

export async function moderateReview(input: {
  adminUserId: string;
  reviewId: string;
  status: ReviewStatus;
}) {
  return prisma.$transaction(async (transaction) => {
    const review = await transaction.review.findUnique({
      where: { id: input.reviewId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        organization: { select: { slug: true } },
      },
    });
    if (!review) reviewDomainError("NOT_FOUND", "Review was not found.");
    const transition = assertModerationTransition(review.status, input.status);
    if (!transition.changed) return { ...review, replayed: true };
    const updated = await transaction.review.update({
      where: { id: review.id },
      data: { status: input.status },
      select: { id: true, status: true, organizationId: true },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: transition.action,
        targetType: "review",
        targetId: review.id,
        metadata: {
          previousStatus: review.status,
          nextStatus: input.status,
          organizationId: review.organizationId,
        },
      },
    });
    return {
      ...updated,
      organization: review.organization,
      replayed: false,
    };
  });
}
