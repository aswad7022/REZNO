export type MobileBusinessVertical =
  | "BARBER"
  | "BEAUTY"
  | "CLINIC"
  | "DENTIST"
  | "SPA"
  | "GYM"
  | "CONSULTANT"
  | "RESTAURANT"
  | "CAFE"
  | "OTHER";

export type MobileMarketplaceBusiness = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string | null;
  categoryName: string | null;
  matchingServiceName: string | null;
  matchingServicePrice: string | null;
  serviceCount: number;
  startingPrice: string | null;
  vertical: MobileBusinessVertical;
  hasMenu: boolean;
  hasTables: boolean;
  averageRating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  branch: {
    latitude: number | null;
    longitude: number | null;
    locationLabel: string | null;
    nearbyLandmark: string | null;
  };
  publicPath: string;
};

export type MobileMarketplaceResponse = {
  data: {
    businesses: MobileMarketplaceBusiness[];
    pagination: {
      limit: number;
      nextCursor: string | null;
      hasMore: boolean;
    };
    filters?: {
      categories: Array<{ name: string; slug: string }>;
      cities: string[];
    };
  };
};

export type MobileApiError = {
  error: {
    code:
      | "INVALID_QUERY"
      | "INVALID_LOCATION"
      | "RATE_LIMITED"
      | "INTERNAL_ERROR";
    message: string;
  };
};
