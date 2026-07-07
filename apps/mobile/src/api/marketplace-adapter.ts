import type { MobileMarketplaceBusiness } from "../types/marketplace";

export type MobileDiscoveryBusiness = {
  category: string;
  distance: string;
  id: string;
  location: string;
  name: string;
  price: string;
  rating: string;
  reviewCount: string;
  status: string;
  tag: string;
};

const verticalLabels: Record<MobileMarketplaceBusiness["vertical"], string> = {
  BARBER: "صالون وتجميل",
  BEAUTY: "صالون وتجميل",
  CAFE: "مقهى",
  CLINIC: "عيادات",
  CONSULTANT: "استشارات",
  DENTIST: "عيادة أسنان",
  GYM: "رياضة",
  OTHER: "خدمات",
  RESTAURANT: "مطاعم",
  SPA: "سبا",
};

export function adaptMarketplaceBusinesses(
  businesses: MobileMarketplaceBusiness[],
): MobileDiscoveryBusiness[] {
  return businesses.map(adaptMarketplaceBusiness);
}

export function adaptMarketplaceBusiness(
  business: MobileMarketplaceBusiness,
): MobileDiscoveryBusiness {
  const category = business.categoryName ?? verticalLabels[business.vertical];
  const location =
    business.city ??
    business.branch.locationLabel ??
    business.branch.nearbyLandmark ??
    "قريب منك";

  return {
    category,
    distance: formatDistance(business),
    id: business.id,
    location,
    name: business.name || "نشاط متاح",
    price: formatPrice(
      business.matchingServicePrice ?? business.startingPrice,
    ),
    rating: formatRating(business.averageRating),
    reviewCount: `${business.reviewCount} تقييم`,
    status: getDiscoveryStatus(business),
    tag: business.matchingServiceName ?? getDiscoveryTag(business),
  };
}

function formatDistance(business: MobileMarketplaceBusiness) {
  if (typeof business.distanceKm === "number") {
    const distance =
      business.distanceKm < 10
        ? business.distanceKm.toFixed(1)
        : Math.round(business.distanceKm).toString();

    return `${distance} كم`;
  }

  return (
    business.city ??
    business.branch.locationLabel ??
    business.branch.nearbyLandmark ??
    "قريب منك"
  );
}

function formatPrice(value: string | null) {
  if (!value) return "السعر عند الحجز";

  const amount = Number(value);
  if (!Number.isFinite(amount)) return `من ${value}`;

  return `من ${new Intl.NumberFormat("ar-IQ", {
    maximumFractionDigits: 0,
  }).format(amount)} د.ع`;
}

function formatRating(value: number | null) {
  return typeof value === "number" ? value.toFixed(1) : "جديد";
}

function getDiscoveryStatus(business: MobileMarketplaceBusiness) {
  if (business.distanceKm !== null) return "قريب منك";
  if (business.hasTables || business.hasMenu) return "حجز سريع";
  if (business.serviceCount > 0) return "متاح اليوم";

  return "متاح";
}

function getDiscoveryTag(business: MobileMarketplaceBusiness) {
  if (business.hasTables || business.hasMenu) return "مطاعم";
  if (business.serviceCount > 1) return `${business.serviceCount} خدمات`;

  return verticalLabels[business.vertical];
}
