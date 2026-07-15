import { Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { respondToReview } from "@/features/reviews/actions/respond-to-review";
import { getBusinessReviewsPageData } from "@/features/reviews/services/reviews";

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

export async function BusinessReviewsPage() {
  const [data, t, format] = await Promise.all([
    getBusinessReviewsPageData(),
    getTranslations("Reviews"),
    getFormatter(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">{t("reviews")}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          {t("businessReviews")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("businessReviewsDescription")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              {t("averageRating")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <span className="text-3xl font-black">
              {data.averageRating === null
                ? "—"
                : format.number(data.averageRating, {
                    maximumFractionDigits: 1,
                  })}
            </span>
            <Star className="size-6 fill-amber-400 text-amber-400" />
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              {t("reviewCount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-black">
              {format.number(data.visibleReviewCount)}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle>{t("customerReviews")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.reviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("noReviewsYet")}
            </div>
          ) : (
            data.reviews.map((review) => (
              <article key={review.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{getCustomerName(review)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {review.booking.serviceNameSnapshot} ·{" "}
                      {format.dateTime(review.booking.startsAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        hour12: true,
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {review.rating}/5
                    </Badge>
                    <Badge variant={review.status === "VISIBLE" ? "outline" : "destructive"}>
                      {t(`status.${review.status}`)}
                    </Badge>
                  </div>
                </div>
                {review.comment ? (
                  <p className="mt-3 leading-7 text-muted-foreground">
                    {review.comment}
                  </p>
                ) : null}
                {review.businessReply ? (
                  <div className="mt-3 rounded-xl bg-muted/60 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t("businessResponse")}
                    </p>
                    <p className="mt-1 leading-7">{review.businessReply}</p>
                  </div>
                ) : null}
                {data.canRespond ? (
                  <form
                    action={respondToReview.bind(null, review.id)}
                    className="mt-3 space-y-2"
                  >
                    <Textarea
                      aria-label={t("businessResponse")}
                      defaultValue={review.businessReply ?? ""}
                      maxLength={1000}
                      name="reply"
                      placeholder={t("businessResponsePlaceholder")}
                      required
                    />
                    <Button size="sm" type="submit">
                      {review.businessReply
                        ? t("updateBusinessResponse")
                        : t("submitBusinessResponse")}
                    </Button>
                  </form>
                ) : null}
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
