import type { Metadata } from "next";

import { PublicBusinessProfilePage } from "@/features/marketplace/components/public-business-profile-page";
import { getPublicBusiness } from "@/features/marketplace/services/marketplace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const business = await getPublicBusiness((await params).slug);
  if (!business) return {};
  const fallbackDescription = [
    business.categoryName,
    business.city,
  ]
    .filter(Boolean)
    .join(" · ");
  const description =
    (business.seoDescription ??
      business.description ??
      fallbackDescription) ||
    undefined;
  const title = business.seoTitle ?? business.name;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: business.ogImageUrl
        ? [business.ogImageUrl]
        : business.coverImageUrl
          ? [business.coverImageUrl]
          : undefined,
    },
  };
}

export default async function PublicBusinessRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <PublicBusinessProfilePage slug={(await params).slug} />;
}
