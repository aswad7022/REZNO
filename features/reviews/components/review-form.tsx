import { Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/features/reviews/actions/submit-review";

export async function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = await getTranslations("Reviews");

  return (
    <form
      action={submitReview.bind(null, bookingId)}
      className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 dark:bg-amber-950/20"
    >
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("question")}</p>
      </div>
      <fieldset>
        <legend className="sr-only">{t("rating")}</legend>
        <div className="flex flex-row-reverse justify-end gap-1" dir="ltr">
          {[5, 4, 3, 2, 1].map((rating) => (
            <label
              key={rating}
              className="group cursor-pointer rounded p-1 focus-within:ring-2 focus-within:ring-ring"
            >
              <input
                className="peer sr-only"
                type="radio"
                name="rating"
                value={rating}
                required
              />
              <Star className="size-6 text-amber-500 peer-checked:fill-amber-400 group-hover:fill-amber-200" />
              <span className="sr-only">{t("stars", { count: rating })}</span>
            </label>
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
      <Button type="submit" size="sm">{t("submit")}</Button>
    </form>
  );
}
