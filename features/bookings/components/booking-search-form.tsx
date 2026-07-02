"use client";

import { CheckCircle2, Clock3, MapPin, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PublicOffering } from "@/features/bookings/types";

export function BookingSearchForm({
  offerings,
  initialDate,
  initialOfferingId,
}: {
  offerings: PublicOffering[];
  initialDate: string;
  initialOfferingId?: string;
}) {
  const router = useRouter();
  const t = useTranslations("Bookings");
  const [offeringId, setOfferingId] = useState(initialOfferingId ?? "");
  const [date, setDate] = useState(initialDate);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offeringId || !date) return;
    const query = new URLSearchParams({ offeringId, date });
    router.push(`/customer/bookings/new?${query.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
    >
      <div className="space-y-2">
        <Label>{t("service")}</Label>
        <div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          role="radiogroup"
          aria-label={t("service")}
        >
          {offerings.map((offering) => {
            const selected = offering.id === offeringId;

            return (
              <button
                key={offering.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setOfferingId(offering.id)}
                className={cn(
                  "min-h-36 rounded-3xl border bg-card p-0 text-start shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40",
                  selected &&
                    "border-primary bg-primary/5 shadow-md shadow-primary/10 ring-2 ring-primary/20",
                )}
              >
                <Card className="h-full border-0 bg-transparent shadow-none ring-0">
                  <CardContent className="flex h-full flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-bold">
                          {offering.serviceName}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {offering.organizationName}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground",
                          selected && "bg-primary text-primary-foreground",
                        )}
                      >
                        {selected ? (
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        ) : (
                          <Sparkles className="size-4" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                      {offering.description ?? t("serviceDefaultDescription")}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Clock3 className="size-3.5" aria-hidden="true" />
                        {t("durationShort", {
                          count: offering.durationMinutes,
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        {t("priceShort", { price: offering.price })}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <MapPin className="size-3.5" aria-hidden="true" />
                        {offering.branchName}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid items-end gap-3 rounded-3xl border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <Label htmlFor="booking-date">{t("date")}</Label>
          <Input
            id="booking-date"
            type="date"
            min={initialDate}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            dir="ltr"
            className="h-12"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!offeringId || !date}
          className="min-h-12 w-full sm:w-auto"
        >
          <Search aria-hidden="true" />
          {t("findTimes")}
        </Button>
      </div>
    </form>
  );
}
