import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { canAdmin } from "@/features/admin/services/admin-auth";
import { updateReviewVisibility } from "@/features/reviews/actions/moderate-reviews";
import { getAdminReviewsPageData } from "@/features/reviews/services/admin-reviews";

function getCustomerName(review: {
  customer: {
    firstName: string;
    lastName: string | null;
    displayName: string | null;
  };
}) {
  return (
    review.customer.displayName ??
    [review.customer.firstName, review.customer.lastName].filter(Boolean).join(" ")
  );
}

export async function AdminReviewsPage() {
  const [reviews, reviewsT, format, canManage] = await Promise.all([
    getAdminReviewsPageData(),
    getTranslations("Reviews"),
    getFormatter(),
    canAdmin("BUSINESSES_MANAGE"),
  ]);

  return (
    <>
      <AdminPageHeader
        title={reviewsT("adminReviews")}
        description={reviewsT("adminReviewsDescription")}
      />
      <div className="space-y-3">
        {reviews.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {reviewsT("noReviewsYet")}
            </CardContent>
          </Card>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{getCustomerName(review)}</p>
                    <Badge variant="secondary">{review.rating}/5</Badge>
                    <Badge
                      variant={
                        review.status === "VISIBLE" ? "outline" : "destructive"
                      }
                    >
                      {reviewsT(`status.${review.status}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Link
                      href={`/admin/businesses/${review.organization.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {review.organization.name}
                    </Link>{" "}
                    · {review.booking.serviceNameSnapshot} ·{" "}
                    {format.dateTime(review.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      hour12: true,
                    })}
                  </p>
                </div>
                {canManage ? (
                  <form action={updateReviewVisibility.bind(null, review.id)}>
                    <input
                      type="hidden"
                      name="status"
                      value={review.status === "VISIBLE" ? "HIDDEN" : "VISIBLE"}
                    />
                    <Button size="sm" variant="outline">
                      {review.status === "VISIBLE"
                        ? reviewsT("hideReview")
                        : reviewsT("unhideReview")}
                    </Button>
                  </form>
                ) : null}
              </div>
              {review.comment ? (
                <p className="mt-3 leading-7 text-muted-foreground">
                  {review.comment}
                </p>
              ) : null}
              {review.businessReply ? (
                <div className="mt-3 rounded-xl bg-muted/60 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {reviewsT("businessResponse")}
                  </p>
                  <p className="mt-1 leading-7">{review.businessReply}</p>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </>
  );
}
