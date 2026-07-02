import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, CalendarDays, Clock3, MapPin, Minus, Plus, Utensils } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicHeader } from "@/components/public-site/public-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createRestaurantReservation } from "@/features/restaurants/actions/create-reservation";
import { getRestaurantReservationPageData } from "@/features/restaurants/services/reservations";

export const metadata: Metadata = {
  title: "حجز طاولة | REZNO",
};

function nextDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function slotPeriod(startsAt: string, timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(startsAt)),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export default async function RestaurantReservationRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    date?: string;
    branchId?: string;
    startsAt?: string;
    guests?: string;
    error?: string;
  }>;
}) {
  const [{ slug }, query, t, format] = await Promise.all([
    params,
    searchParams,
    getTranslations("RestaurantReservations"),
    getFormatter(),
  ]);
  const guestCount = query.guests ? Number(query.guests) : undefined;
  const data = await getRestaurantReservationPageData({
    slug,
    branchId: query.branchId,
    date: query.date,
    startsAt: query.startsAt,
    guestCount: Number.isFinite(guestCount) ? guestCount : undefined,
  });
  if (!data) notFound();

  const timezone = data.branch?.timezone ?? "Asia/Baghdad";
  const selectedStartsAt = data.selectedStartsAt;
  const groupedSlots = data.slots.reduce(
    (groups, slot) => {
      groups[slotPeriod(slot.startsAt, timezone)].push(slot);
      return groups;
    },
    {
      morning: [] as typeof data.slots,
      afternoon: [] as typeof data.slots,
      evening: [] as typeof data.slots,
    },
  );
  const selectedTable =
    data.availableTables.length === 1 ? data.availableTables[0] : null;
  const branchParam = data.branch ? `&branchId=${data.branch.id}` : "";
  const branchInput = data.branch ? (
    <input type="hidden" name="branchId" value={data.branch.id} />
  ) : null;

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-6">
          <div className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card shadow-xl shadow-primary/5">
            <div className="bg-gradient-to-l from-primary via-indigo-600 to-violet-600 p-6 text-primary-foreground sm:p-8">
              <Badge className="bg-white/15 text-white hover:bg-white/15">
                {data.business.vertical === "CAFE" ? t("cafe") : t("restaurant")}
              </Badge>
              <h1 className="mt-4 text-3xl font-black sm:text-4xl">
                {t("title", { business: data.business.name })}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
                {t("description")}
              </p>
            </div>
            <CardContent className="grid gap-3 p-5 text-sm text-muted-foreground sm:grid-cols-2">
              {data.branch ? (
                <>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4 text-primary" />
                    {[data.branch.name, data.branch.city, data.branch.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock3 className="size-4 text-primary" />
                    {t("duration", { count: data.durationMinutes })}
                  </p>
                </>
              ) : null}
            </CardContent>
          </div>

          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-5 text-primary" />
                {t("steps.time")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {data.branches.length > 1 ? (
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_auto]"
                  action={`/${slug}/reserve`}
                >
                  <input type="hidden" name="date" value={data.selectedDate} />
                  <input type="hidden" name="guests" value={data.guestCount} />
                  <select
                    name="branchId"
                    defaultValue={data.branch?.id ?? ""}
                    className="h-11 rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    aria-label={t("branch")}
                    required
                  >
                    <option value="" disabled>
                      {t("selectBranch")}
                    </option>
                    {data.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {[branch.name, branch.city].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                  <Button type="submit">{t("chooseBranch")}</Button>
                </form>
              ) : null}
              <form className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]" action={`/${slug}/reserve`}>
                {branchInput}
                <Input type="date" name="date" defaultValue={data.selectedDate} />
                <Input
                  type="number"
                  min={1}
                  max={100}
                  name="guests"
                  defaultValue={data.guestCount}
                  aria-label={t("guestCount")}
                />
                <Button type="submit">{t("updateSearch")}</Button>
              </form>
              <div className="flex flex-wrap gap-2">
                {[-1, 1, 2, 3].map((offset) => (
                  <Button key={offset} asChild variant="outline" size="sm">
                    <Link
                      href={`/${slug}/reserve?date=${nextDate(data.selectedDate, offset)}&guests=${data.guestCount}${branchParam}`}
                    >
                      {offset === -1
                        ? t("previousDay")
                        : offset === 1
                          ? t("tomorrow")
                          : format.dateTime(new Date(`${nextDate(data.selectedDate, offset)}T00:00:00Z`), {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            })}
                    </Link>
                  </Button>
                ))}
              </div>

              {query.error ? (
                <p className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  {t(`errors.${query.error}` as "errors.invalid")}
                </p>
              ) : null}

              {data.unavailableReason ? (
                <p className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">
                  {t(`empty.${data.unavailableReason}`)}
                </p>
              ) : null}

              <div className="space-y-5">
                {(["morning", "afternoon", "evening"] as const).map((period) =>
                  groupedSlots[period].length > 0 ? (
                    <div key={period}>
                      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                        {t(`periods.${period}`)}
                      </h3>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {groupedSlots[period].map((slot) => {
                          const active = slot.startsAt === selectedStartsAt;
                          return (
                            <Button
                              key={slot.startsAt}
                              asChild
                              variant={active ? "default" : "outline"}
                              className="h-12"
                            >
                              <Link
                                href={`/${slug}/reserve?date=${data.selectedDate}&guests=${data.guestCount}${branchParam}&startsAt=${encodeURIComponent(slot.startsAt)}`}
                              >
                                {format.dateTime(new Date(slot.startsAt), {
                                  timeZone: timezone,
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </Link>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </CardContent>
          </Card>

          {selectedStartsAt && data.branch ? (
            <form action={createRestaurantReservation} className="space-y-6">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="date" value={data.selectedDate} />
              <input type="hidden" name="branchId" value={data.branch.id} />
              <input type="hidden" name="startsAt" value={selectedStartsAt} />
              <input type="hidden" name="guestCount" value={data.guestCount} />
              <input
                type="hidden"
                name="durationMinutes"
                value={data.durationMinutes}
              />

              <Card id="confirm" className="border-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Armchair className="size-5 text-primary" />
                    {t("steps.table")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {data.availableTables.length === 0 ? (
                    <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                      {t("empty.NO_TABLES")}
                    </p>
                  ) : (
                    data.availableTables.map((table) => (
                      <label
                        key={table.id}
                        className="cursor-pointer rounded-2xl border border-primary/10 bg-background p-4 transition hover:border-primary/30 hover:shadow-md"
                      >
                        <input
                          className="sr-only peer"
                          type="radio"
                          name="tableId"
                          value={table.id}
                          defaultChecked={table.id === selectedTable?.id}
                          required
                        />
                        <span className="block rounded-xl border border-transparent p-1 peer-checked:border-primary">
                          <span className="block font-semibold">{table.name}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {t("tableCapacity", { count: table.capacity })}
                            {table.area ? ` · ${table.area}` : ""}
                            {table.positionLabel ? ` · ${table.positionLabel}` : ""}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </CardContent>
              </Card>

              {data.menuCategories.length > 0 ? (
                <Card className="border-primary/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Utensils className="size-5 text-primary" />
                      {t("steps.menu")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      {t("menuOptional")}
                    </p>
                    {data.menuCategories.map((category) => (
                      <div key={category.id}>
                        <h3 className="font-semibold">{category.name}</h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {category.items.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border bg-background p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  {item.description ? (
                                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                      {item.description}
                                    </p>
                                  ) : null}
                                </div>
                                <strong className="text-sm">
                                  {format.number(Number(item.price), {
                                    maximumFractionDigits: 0,
                                  })}{" "}
                                  {item.currency}
                                </strong>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <Minus className="size-4 text-muted-foreground" />
                                <Input
                                  className="h-9 w-20 text-center"
                                  type="number"
                                  name={`menuItem:${item.id}`}
                                  min={0}
                                  max={20}
                                  defaultValue={0}
                                  aria-label={t("itemQuantity", { item: item.name })}
                                />
                                <Plus className="size-4 text-muted-foreground" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle>{t("steps.confirm")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <textarea
                    name="customerNote"
                    rows={3}
                    className="w-full rounded-2xl border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={t("notePlaceholder")}
                  />
                  <Button size="lg" className="w-full" type="submit">
                    {t("confirm")}
                  </Button>
                </CardContent>
              </Card>
            </form>
          ) : null}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="border-primary/10 bg-card/95 shadow-xl shadow-primary/5">
            <CardHeader>
              <CardTitle>{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">{t("business")}: </span>
                {data.business.name}
              </p>
              <p>
                <span className="text-muted-foreground">{t("guests")}: </span>
                {data.guestCount}
              </p>
              {selectedStartsAt ? (
                <p>
                  <span className="text-muted-foreground">{t("time")}: </span>
                  {format.dateTime(new Date(selectedStartsAt), {
                    timeZone: timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                    hour12: true,
                  })}
                </p>
              ) : null}
              {data.branch ? (
                <p>
                  <span className="text-muted-foreground">{t("location")}: </span>
                  {[data.branch.name, data.branch.city].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <Button asChild variant="outline" className="w-full">
                <Link href={`/${slug}`}>{t("backToProfile")}</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur md:hidden">
        <Button asChild size="lg" className="w-full">
          <a href={selectedStartsAt ? "#confirm" : "#"}>{t("continue")}</a>
        </Button>
      </div>
      <PublicFooter />
    </div>
  );
}
