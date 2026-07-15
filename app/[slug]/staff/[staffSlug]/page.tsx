import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, ImageIcon, Sparkles, Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicHeader } from "@/components/public-site/public-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicProfileImage } from "@/features/marketplace/components/public-profile-image";
import {
  PublicProfileCardMotion,
  PublicProfilePageMotion,
  PublicProfileSection,
} from "@/features/marketplace/components/public-profile-motion";
import { getPublicProfessionalProfile } from "@/features/marketplace/services/marketplace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; staffSlug: string }>;
}): Promise<Metadata> {
  const { slug, staffSlug } = await params;
  const profile = await getPublicProfessionalProfile(slug, staffSlug);
  if (!profile) return {};

  const description =
    profile.bio ??
    ([profile.business.name, profile.business.categoryName]
      .filter(Boolean)
      .join(" · ") ||
      undefined);

  return {
    title: `${profile.name} · ${profile.business.name}`,
    description,
    openGraph: {
      title: `${profile.name} · ${profile.business.name}`,
      description,
      images: profile.photoUrl ? [profile.photoUrl] : undefined,
    },
  };
}

export default async function PublicProfessionalRoute({
  params,
}: {
  params: Promise<{ slug: string; staffSlug: string }>;
}) {
  const { slug, staffSlug } = await params;
  const [profile, t, format] = await Promise.all([
    getPublicProfessionalProfile(slug, staffSlug),
    getTranslations("BusinessPublic"),
    getFormatter(),
  ]);

  if (!profile) notFound();

  return (
    <PublicProfilePageMotion>
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <main>
          <section className="border-b bg-gradient-to-b from-primary/10 via-background to-background">
            <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
              <Button asChild variant="ghost" className="mb-6">
                <Link href={`/${profile.business.slug}`}>
                  <ArrowLeft className="size-4" />
                  {t("professionalProfile.backToBusiness")}
                </Link>
              </Button>

              <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-end">
                <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-muted shadow-2xl shadow-primary/10">
                  {profile.photoUrl ? (
                    <PublicProfileImage
                      src={profile.photoUrl}
                      alt={profile.name}
                      sizes="(max-width: 1024px) 100vw, 256px"
                      priority
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-4xl font-semibold text-primary">
                      {profile.name.slice(0, 2)}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <BadgeCheck className="size-3.5" />
                      {t("professionalProfile.publicProfessional")}
                    </Badge>
                    {profile.business.categoryName ? (
                      <Badge variant="outline">
                        {profile.business.categoryName}
                      </Badge>
                    ) : null}
                  </div>
                  <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                    {profile.name}
                  </h1>
                  <p className="mt-3 text-lg text-muted-foreground">
                    {t("professionalProfile.atBusiness", {
                      business: profile.business.name,
                    })}
                  </p>
                  {profile.averageRating !== null ? (
                    <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      {format.number(profile.averageRating, { maximumFractionDigits: 1 })}
                      <span className="text-muted-foreground">({format.number(profile.reviewCount)})</span>
                    </p>
                  ) : null}
                  {profile.specialties.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {profile.specialties.map((specialty) => (
                        <Badge key={specialty} className="rounded-full">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {profile.bio ? (
                    <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground">
                      {profile.bio}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <PublicProfileSection>
              <h2 className="flex items-center gap-2 text-2xl font-semibold">
                <BriefcaseBusiness className="size-5" />
                {t("professionalProfile.services")}
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {profile.services.map((service) => (
                  <PublicProfileCardMotion key={service.id}>
                    <Card className="h-full border-primary/10">
                      <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden rounded-t-xl bg-gradient-to-br from-primary/15 via-accent/25 to-muted">
                        {service.imageUrl ? (
                          <PublicProfileImage
                            src={service.imageUrl}
                            alt={service.name}
                            sizes="(max-width: 768px) 100vw, 45vw"
                          />
                        ) : (
                          <ImageIcon className="size-9 text-primary/35" />
                        )}
                      </div>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle>{service.name}</CardTitle>
                          <Badge variant="secondary">
                            {service.categoryName}
                          </Badge>
                        </div>
                        {service.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {service.description}
                          </p>
                        ) : null}
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">
                            {service.branchName}
                          </span>
                          <span className="font-medium">
                            {t("duration", {
                              count: service.durationMinutes,
                            })}
                          </span>
                          <strong>
                            {t("price", {
                              price: format.number(Number(service.price), {
                                maximumFractionDigits: 0,
                              }),
                            })}
                          </strong>
                        </div>
                        <Button asChild className="mt-4 w-full">
                          <Link href={`/book/${service.id}`}>
                            <Sparkles />
                            {t("bookNow")}
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </PublicProfileCardMotion>
                ))}
              </div>
            </PublicProfileSection>
          </div>
        </main>
        <PublicFooter />
      </div>
    </PublicProfilePageMotion>
  );
}
