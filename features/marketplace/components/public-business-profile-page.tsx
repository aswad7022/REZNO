import Link from "next/link";
import {
  CalendarDays,
  Camera,
  Armchair,
  Clock3,
  ExternalLink,
  Globe2,
  ImageIcon,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Utensils,
  UsersRound,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicHeader } from "@/components/public-site/public-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicProfileActions } from "@/features/marketplace/components/public-profile-actions";
import { PublicProfileImage } from "@/features/marketplace/components/public-profile-image";
import {
  PublicProfileCardMotion,
  PublicProfilePageMotion,
  PublicProfileSection,
} from "@/features/marketplace/components/public-profile-motion";
import { getPublicBusiness } from "@/features/marketplace/services/marketplace";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { FavoriteBusinessButton } from "@/features/favorites/components/favorite-business-button";
import { FavoriteServiceButton } from "@/features/favorites/components/favorite-service-button";
import {
  getCurrentCustomerFavoriteBusinessIds,
  getCurrentCustomerFavoriteServiceIds,
} from "@/features/favorites/services/favorites";
import { NearbyBusinessMap } from "@/features/location/components/nearby-business-map";
import { buildWazeNavigationUrl } from "@/features/location/services/waze";

export async function PublicBusinessProfilePage({ slug }: { slug: string }) {
  const [business, t, reviewsT, hoursT, format] = await Promise.all([
    getPublicBusiness(slug),
    getTranslations("BusinessPublic"),
    getTranslations("Reviews"),
    getTranslations("WorkingHours"),
    getFormatter(),
  ]);
  if (!business) notFound();
  const offeringIds = business.branches.flatMap((branch) =>
    branch.offerings.map((offering) => offering.id),
  );
  const [favoriteState, serviceFavoriteState] = await Promise.all([
    getCurrentCustomerFavoriteBusinessIds([business.id]),
    getCurrentCustomerFavoriteServiceIds(offeringIds),
  ]);
  const isFavorited = favoriteState.favoriteOrganizationIds.has(business.id);
  const restaurantExperience = isRestaurantVertical(business.vertical);
  const whatsappPhone = business.whatsappPhone?.replace(/\D/g, "");
  const firstOffering = restaurantExperience
    ? undefined
    : business.branches.flatMap((branch) => branch.offerings)[0];
  const formatWorkingTime = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return format.dateTime(new Date(Date.UTC(2020, 0, 1, hour, minute)), {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <PublicProfilePageMotion>
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <PublicHeader />
        <main>
          <section className="relative overflow-hidden border-b border-border/70 bg-background">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_32rem)]" />
            <div className="mx-auto max-w-7xl px-0 sm:px-6 sm:pt-6">
              <div className="relative aspect-[16/6] max-h-96 min-h-48 overflow-hidden bg-gradient-to-br from-primary via-indigo-600 to-purple-600 shadow-2xl shadow-primary/10 sm:rounded-[2rem]">
                {business.coverImageUrl ? (
                  <PublicProfileImage
                    src={business.coverImageUrl}
                    alt=""
                    sizes="(max-width: 1280px) 100vw, 1280px"
                    priority
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/8 to-transparent" />
              </div>
              <div className="relative px-4 pb-8 sm:px-8">
                <div className="relative -mt-16 size-32 overflow-hidden rounded-[2rem] border-4 border-background bg-primary/10 shadow-2xl shadow-slate-950/15 sm:size-36">
                  {business.logoUrl ? (
                    <PublicProfileImage
                      src={business.logoUrl}
                      alt={business.name}
                      sizes="128px"
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-2xl font-semibold text-primary">
                      {business.name.slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h1 className="bg-gradient-to-l from-slate-950 via-primary to-violet-700 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-violet-200 dark:to-indigo-200">
                      {business.name}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {business.categoryName ? (
                        <Badge variant="secondary" className="border border-primary/10 bg-primary/10 text-primary">
                          {business.categoryName}
                        </Badge>
                      ) : null}
                      {business.city ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-4" />
                          {business.city}
                        </span>
                      ) : null}
                      {business.averageRating ? (
                        <span className="flex items-center gap-1.5 font-medium">
                          <Star className="size-4 fill-amber-400 text-amber-500" />
                          {reviewsT("summary", {
                            rating: format.number(business.averageRating, {
                              maximumFractionDigits: 1,
                            }),
                            count: business.reviewCount,
                          })}
                        </span>
                      ) : null}
                      <FavoriteBusinessButton
                        canToggle={favoriteState.isAuthenticated}
                        initialFavorited={isFavorited}
                        organizationId={business.id}
                      />
                    </div>
                    <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
                      {business.description ?? t("defaultDescription")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {business.businessPhone ? (
                        <Button asChild>
                          <a href={`tel:${business.businessPhone}`}>
                            <Phone />
                            {t("call")}
                          </a>
                        </Button>
                      ) : null}
                      {whatsappPhone ? (
                        <Button asChild variant="outline">
                          <a
                            href={`https://wa.me/${whatsappPhone}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle />
                            {t("whatsapp")}
                          </a>
                        </Button>
                      ) : null}
                    </div>
                    <PublicProfileActions
                      businessName={business.name}
                      labels={{
                        share: t("actions.share"),
                        copy: t("actions.copy"),
                        copied: t("actions.copied"),
                        qr: t("actions.qr"),
                        qrDescription: t("actions.qrDescription"),
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-12">
              {business.galleryUrls.length > 0 ? (
                <PublicProfileSection>
                  <SectionTitle title={t("gallery")} />
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {business.galleryUrls.map((url, index) => (
                      <div
                        key={url}
                        className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted"
                      >
                        <PublicProfileImage
                          src={url}
                          alt={t("galleryImage", { index: index + 1 })}
                          sizes="(max-width: 768px) 50vw, 30vw"
                        />
                      </div>
                    ))}
                  </div>
                </PublicProfileSection>
              ) : null}

              {restaurantExperience && business.menuCategories.length > 0 ? (
                <PublicProfileSection>
                  <SectionTitle title={t("menu")} icon={<Utensils />} />
                  <div id="restaurant-menu" className="mt-4 space-y-5">
                    {business.menuCategories.map((category) => (
                      <Card key={category.id} className="border-primary/10">
                        <CardHeader>
                          <CardTitle>{category.name}</CardTitle>
                          {category.description ? (
                            <p className="text-sm text-muted-foreground">
                              {category.description}
                            </p>
                          ) : null}
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                          {category.items.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border bg-background/70 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold">{item.name}</p>
                                  {item.description ? (
                                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                      {item.description}
                                    </p>
                                  ) : null}
                                </div>
                                <Badge variant={item.isAvailable ? "default" : "secondary"}>
                                  {item.isAvailable ? t("available") : t("unavailable")}
                                </Badge>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                                <strong>
                                  {format.number(Number(item.price), {
                                    maximumFractionDigits: 0,
                                  })}{" "}
                                  {item.currency}
                                </strong>
                                {item.preparationMinutes ? (
                                  <span className="text-muted-foreground">
                                    {t("preparationMinutes", {
                                      count: item.preparationMinutes,
                                    })}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </PublicProfileSection>
              ) : null}

              {restaurantExperience && business.seatingAreas.length > 0 ? (
                <PublicProfileSection>
                  <SectionTitle title={t("seating")} icon={<Armchair />} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {business.seatingAreas.map((area) => (
                      <Badge key={area} variant="secondary" className="rounded-full px-3 py-1.5">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </PublicProfileSection>
              ) : null}

              {business.branches.map((branch) => (
                <PublicProfileSection key={branch.id}>
                  {(() => {
                    const wazeUrl =
                      branch.latitude !== null && branch.longitude !== null
                        ? buildWazeNavigationUrl({
                            latitude: branch.latitude,
                            longitude: branch.longitude,
                          })
                        : null;
                    return (
                      <>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{branch.name}</h2>
                      {[
                        branch.locationLabel,
                        branch.address,
                        branch.city,
                      ].filter(Boolean).length ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[branch.locationLabel, branch.address, branch.city]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {branch.nearbyLandmark ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {branch.nearbyLandmark}
                        </p>
                      ) : null}
                      {branch.locationInstructions ? (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {branch.locationInstructions}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                    {business.googleMapsUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={business.googleMapsUrl} target="_blank" rel="noreferrer">
                          <MapPin />
                          {t("openMap")}
                        </a>
                      </Button>
                    ) : null}
                    {wazeUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={wazeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation />
                          {t("openInWaze")}
                        </a>
                      </Button>
                    ) : null}
                    </div>
                  </div>
                  {branch.latitude !== null && branch.longitude !== null ? (
                    <div className="mb-5 overflow-hidden rounded-3xl">
                      <NearbyBusinessMap
                        markers={[
                          {
                            id: branch.id,
                            title: branch.name,
                            description:
                              branch.locationLabel ?? branch.address,
                            latitude: branch.latitude,
                            longitude: branch.longitude,
                            landmark: branch.nearbyLandmark,
                            wazeUrl,
                          },
                        ]}
                      />
                    </div>
                  ) : null}
                      </>
                    );
                  })()}
                  {!restaurantExperience && branch.offerings.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {branch.offerings.map((offering) => (
                      <PublicProfileCardMotion key={offering.id}>
                        <Card className="h-full overflow-hidden border-primary/10 shadow-sm transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10">
                          <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-accent/25 to-muted">
                            {offering.imageUrl ? (
                              <PublicProfileImage
                                src={offering.imageUrl}
                                alt={offering.serviceName}
                                sizes="(max-width: 768px) 100vw, 45vw"
                              />
                            ) : (
                              <ImageIcon className="size-9 text-primary/35" />
                            )}
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/18 to-transparent" />
                          </div>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <CardTitle className="text-lg font-bold">
                                {offering.serviceName}
                              </CardTitle>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge variant="secondary" className="bg-primary/10 text-primary">
                                  {offering.categoryName}
                                </Badge>
                                <FavoriteServiceButton
                                  branchServiceId={offering.id}
                                  canToggle={serviceFavoriteState.isAuthenticated}
                                  compact
                                  initialFavorited={serviceFavoriteState.favoriteBranchServiceIds.has(
                                    offering.id,
                                  )}
                                />
                              </div>
                            </div>
                            {offering.description ? (
                              <p className="line-clamp-2 text-sm text-muted-foreground">
                                {offering.description}
                              </p>
                            ) : null}
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Clock3 className="size-4" />
                                {t("duration", { count: offering.durationMinutes })}
                              </span>
                              <strong>
                                {t("price", {
                                  price: format.number(Number(offering.price), {
                                    maximumFractionDigits: 0,
                                  }),
                                })}
                              </strong>
                            </div>
                            {offering.assignedEmployees.length ? (
                              <p className="mt-3 text-xs text-muted-foreground">
                                {t("providers", {
                                  names: offering.assignedEmployees.join("، "),
                                })}
                              </p>
                            ) : null}
                            <Button asChild className="mt-4 w-full">
                              <Link href={`/book/${offering.id}`}>
                                <Sparkles />
                                {t("bookNow")}
                              </Link>
                            </Button>
                          </CardContent>
                        </Card>
                      </PublicProfileCardMotion>
                      ))}
                    </div>
                  ) : null}
                  {branch.workingHours.length > 0 ? (
                    <Card className="mt-5 border-primary/10">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <CalendarDays className="size-4" />
                          {t("workingHours")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-2 sm:grid-cols-2">
                        {branch.workingHours.map((hours) => (
                          <p key={hours.dayOfWeek} className="flex justify-between gap-3 text-sm">
                            <span>{hoursT(`days.${hours.dayOfWeek}` as "days.0")}</span>
                            <span dir="ltr" className="text-muted-foreground">
                              {formatWorkingTime(hours.openTime)} –{" "}
                              {formatWorkingTime(hours.closeTime)}
                            </span>
                          </p>
                        ))}
                      </CardContent>
                    </Card>
                  ) : null}
                  {branch.specialClosures.length > 0 ? (
                    <Card className="mt-4 border-amber-500/30">
                      <CardHeader>
                        <CardTitle className="text-base">{t("specialClosures")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        {branch.specialClosures.map((closure) => (
                          <p key={closure.id}>
                            {format.dateTimeRange(closure.startsAt, closure.endsAt, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              hour12: true,
                            })}
                            {closure.reason ? ` · ${closure.reason}` : ""}
                          </p>
                        ))}
                      </CardContent>
                    </Card>
                  ) : null}
                </PublicProfileSection>
              ))}

              {business.team.length > 0 ? (
                <PublicProfileSection>
                  <SectionTitle title={t("team")} icon={<UsersRound />} />
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {business.team.map((member) => (
                      <PublicProfileCardMotion key={member.id}>
                        <Card className="h-full border-primary/10 transition-all hover:shadow-xl hover:shadow-primary/10">
                          <CardContent className="p-5">
                            <div className="relative size-20 overflow-hidden rounded-3xl bg-muted ring-1 ring-border">
                              {member.photoUrl ? (
                                <PublicProfileImage
                                  src={member.photoUrl}
                                  alt={member.name}
                                  sizes="80px"
                                />
                              ) : (
                                <span className="grid size-full place-items-center text-xl text-primary">
                                  {member.name.slice(0, 2)}
                                </span>
                              )}
                            </div>
                            <h3 className="mt-3 font-semibold">{member.name}</h3>
                            {member.specialties.length ? (
                              <p className="mt-1 text-xs text-primary">
                                {member.specialties.join(" · ")}
                              </p>
                            ) : null}
                            {member.bio ? (
                              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                {member.bio}
                              </p>
                            ) : null}
                            <Button asChild variant="outline" className="mt-4 w-full">
                              <Link
                                href={`/${business.slug}/staff/${member.publicSlug}`}
                              >
                                {t("viewProfessionalProfile")}
                              </Link>
                            </Button>
                          </CardContent>
                        </Card>
                      </PublicProfileCardMotion>
                    ))}
                  </div>
                </PublicProfileSection>
              ) : null}

              {business.bookingPolicy ? (
                <PublicProfileSection>
                    <Card className="border-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="size-5" />
                        {t("bookingPolicy")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="whitespace-pre-line leading-7 text-muted-foreground">
                      {business.bookingPolicy}
                    </CardContent>
                  </Card>
                </PublicProfileSection>
              ) : null}

              {business.faqItems.length > 0 ? (
                <PublicProfileSection>
                  <SectionTitle title={t("faq")} />
                  <div className="mt-4 space-y-3">
                    {business.faqItems.map((item) => (
                      <details key={item.question} className="rounded-2xl border bg-card/90 p-4 shadow-sm">
                        <summary className="cursor-pointer font-medium">{item.question}</summary>
                        <p className="mt-3 leading-7 text-muted-foreground">{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </PublicProfileSection>
              ) : null}

              <PublicProfileSection>
                <SectionTitle title={reviewsT("customerReviews")} />
                {business.recentReviews.length > 0 ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {business.recentReviews.map((review) => (
                      <Card key={review.id} className="border-primary/10">
                        <CardContent className="p-5">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <Star className="size-4 fill-amber-400 text-amber-500" />
                            {review.rating}/5 · {review.customerName}
                          </p>
                          <p className="mt-3 leading-7 text-muted-foreground">{review.comment}</p>
                          {review.businessReply ? (
                            <div className="mt-3 rounded-xl bg-muted/60 p-3">
                              <p className="text-xs font-semibold text-muted-foreground">
                                {reviewsT("businessResponse")}
                              </p>
                              <p className="mt-1 leading-7">{review.businessReply}</p>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{reviewsT("empty")}</p>
                )}
              </PublicProfileSection>
            </div>

            <aside>
              <Card className="border-primary/10 bg-card/95 shadow-xl shadow-primary/5 lg:sticky lg:top-24">
                <CardHeader><CardTitle>{t("contact")}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {business.businessPhone ? <ContactLink href={`tel:${business.businessPhone}`} icon={<Phone />} label={business.businessPhone} ltr /> : null}
                  {business.businessEmail ? <ContactLink href={`mailto:${business.businessEmail}`} icon={<Mail />} label={business.businessEmail} /> : null}
                  {business.website ? <ContactLink href={business.website} icon={<Globe2 />} label={t("website")} external /> : null}
                  {business.instagramUrl ? <ContactLink href={business.instagramUrl} icon={<Camera />} label="Instagram" external /> : null}
                  {business.facebookUrl ? <ContactLink href={business.facebookUrl} icon={<ExternalLink />} label="Facebook" external /> : null}
                  {!business.businessPhone && !business.businessEmail && !business.website ? (
                    <p className="text-muted-foreground">{t("noContact")}</p>
                  ) : null}
                </CardContent>
              </Card>
              {restaurantExperience ? (
                <Card className="mt-4 border-primary/10 bg-card/95 shadow-xl shadow-primary/5 lg:sticky lg:top-[25rem]">
                  <CardHeader>
                    <CardTitle>{t("reserveTable")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("reserveTableDescription")}
                    </p>
                    <Button asChild className="w-full">
                      <Link href={`/${business.slug}/reserve`}>
                        <Utensils />
                        {t("reserveTable")}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </aside>
          </div>
        </main>
        {firstOffering ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 shadow-[0_-8px_30px_rgb(15_23_42/0.08)] backdrop-blur md:hidden">
            <Button
              asChild
              size="lg"
              className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 shadow-sm"
            >
              <Link href={`/book/${firstOffering.id}`}>
                <Sparkles />
                {t("bookNow")}
              </Link>
            </Button>
          </div>
        ) : null}
        {restaurantExperience ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 shadow-[0_-8px_30px_rgb(15_23_42/0.08)] backdrop-blur md:hidden">
            <Button asChild size="lg" className="w-full">
              <Link href={`/${business.slug}/reserve`}>
                <Utensils />
                {t("reserveTable")}
              </Link>
            </Button>
          </div>
        ) : null}
        <PublicFooter />
      </div>
    </PublicProfilePageMotion>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return <h2 className="flex items-center gap-2 text-2xl font-semibold">{icon}{title}</h2>;
}

function ContactLink({
  href,
  icon,
  label,
  external,
  ltr,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
  ltr?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="flex items-center gap-2 break-all hover:text-primary hover:underline"
    >
      <span className="size-4 shrink-0">{icon}</span>
      <span dir={ltr ? "ltr" : undefined}>{label}</span>
    </a>
  );
}
