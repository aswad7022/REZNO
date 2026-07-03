"use client";

import { useActionState, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/features/reviews/actions/submit-review";
import { initialReviewActionState } from "@/features/reviews/types";

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Reviews");
  const ratingGroupId = useId();
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [state, formAction, pending] = useActionState(
    submitReview.bind(null, bookingId),
    initialReviewActionState,
  );
  const ratings = [1, 2, 3, 4, 5];

  function handleRatingKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (event.key === "Home") {
      setSelectedRating(1);
      return;
    }
    if (event.key === "End") {
      setSelectedRating(5);
      return;
    }

    const current = selectedRating ?? 0;
    const next =
      event.key === "ArrowRight"
        ? Math.min(5, current + 1)
        : Math.max(1, current - 1 || 1);
    setSelectedRating(next);
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 dark:bg-amber-950/20"
    >
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("question")}</p>
      </div>
      <fieldset>
        <legend className="sr-only">{t("rating")}</legend>
        <input type="hidden" name="rating" value={selectedRating ?? ""} />
        <div
          aria-label={t("rating")}
          className="flex flex-wrap items-center gap-2"
          id={ratingGroupId}
          onKeyDown={handleRatingKeyDown}
          role="radiogroup"
        >
          <div className="flex gap-1" dir="ltr">
            {ratings.map((rating) => (
              <button
                key={rating}
                aria-checked={selectedRating === rating}
                aria-label={t("starOption", { rating })}
                className="group inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-transparent text-amber-500 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-amber-950/30"
                onClick={() => setSelectedRating(rating)}
                role="radio"
                type="button"
              >
                <Star
                  aria-hidden="true"
                  className={
                    rating <= (selectedRating ?? 0)
                      ? "size-7 fill-amber-400"
                      : "size-7 fill-transparent"
                  }
                />
                <span className="sr-only">
                  {t("ratingValue", { rating })}
                </span>
              </button>
            ))}
          </div>
          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
            {selectedRating
              ? `${t("yourRating")}: ${selectedRating} ${t("ofFive")}`
              : t("chooseYourRating")}
          </p>
        </div>
        <div className="mt-2 flex gap-1 text-[0.65rem] text-muted-foreground" dir="ltr">
          {ratings.map((rating) => (
            <span
              key={rating}
              className="inline-flex min-w-10 justify-center"
            >
              {rating}
            </span>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor={`review-comment-${bookingId}`}>{t("comment")}</Label>
        <Textarea
          id={`review-comment-${bookingId}`}
          name="comment"
          maxLength={1000}
          placeholder={t("commentPlaceholder")}
        />
      </div>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-emerald-700 dark:text-emerald-300"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
