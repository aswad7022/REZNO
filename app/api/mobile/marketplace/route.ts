import type { BusinessVertical } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { businessVerticals } from "@/features/businesses/config/verticals";
import { hasValidCoordinates } from "@/features/location/services/distance";
import { DEFAULT_NEARBY_RADIUS_KM } from "@/features/location/services/nearby-businesses";
import {
  getMarketplaceFilters,
  searchMarketplace,
} from "@/features/marketplace/services/marketplace";
import { MAX_SEARCH_QUERY_LENGTH } from "@/features/search/services/search-normalization";
import { logServerError } from "@/lib/logging/server";
import {
  consumeRateLimit,
  getRequestRateLimitIdentifier,
} from "@/lib/security/rate-limit";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_RADIUS_KM = 25;
const MAX_SHORT_FILTER_LENGTH = 80;

type MobileApiErrorCode =
  | "INVALID_QUERY"
  | "INVALID_LOCATION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export async function GET(request: NextRequest) {
  const identifier = await getRequestRateLimitIdentifier(
    "mobile-marketplace-unknown",
  );
  const rateLimit = consumeRateLimit("mobile.marketplace", identifier, {
    limit: 120,
    windowMs: 60_000,
  });

  if (!rateLimit.success) {
    return mobileError("RATE_LIMITED", "Too many requests.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  try {
    const parsed = parseMarketplaceQuery(request.nextUrl.searchParams);

    if (!parsed.ok) {
      return mobileError(parsed.code, parsed.message, 400);
    }

    const take = parsed.value.limit + 1;
    const [businesses, filters] = await Promise.all([
      searchMarketplace({ ...parsed.value, take }),
      getMarketplaceFilters(),
    ]);
    const visibleBusinesses = businesses.slice(0, parsed.value.limit);

    return NextResponse.json(
      {
        data: {
          businesses: visibleBusinesses.map((business) => ({
            id: business.id,
            slug: business.slug,
            name: business.name,
            description: business.description,
            logoUrl: business.logoUrl,
            coverImageUrl: business.coverImageUrl,
            city: business.city,
            categoryName: business.categoryName,
            matchingServiceName: business.matchingServiceName,
            matchingServicePrice: business.matchingServicePrice,
            serviceCount: business.serviceCount,
            startingPrice: business.startingPrice,
            vertical: business.vertical,
            hasMenu: business.hasMenu,
            hasTables: business.hasTables,
            averageRating: business.averageRating,
            reviewCount: business.reviewCount,
            distanceKm: business.distanceKm,
            branch: {
              latitude: business.branchLatitude,
              longitude: business.branchLongitude,
              locationLabel: business.branchLocationLabel,
              nearbyLandmark: business.branchNearbyLandmark,
            },
            publicPath: `/${business.slug}`,
          })),
          pagination: {
            limit: parsed.value.limit,
            nextCursor: null,
            hasMore: businesses.length > parsed.value.limit,
          },
          filters,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    logServerError("api.mobile.marketplace", error);
    return mobileError("INTERNAL_ERROR", "Could not load marketplace.", 500);
  }
}

function parseMarketplaceQuery(params: URLSearchParams):
  | {
      ok: true;
      value: {
        query?: string;
        category?: string;
        city?: string;
        vertical?: BusinessVertical;
        latitude?: number;
        longitude?: number;
        radiusKm?: number;
        limit: number;
      };
    }
  | { ok: false; code: MobileApiErrorCode; message: string } {
  const query = normalizeShortValue(params.get("q"), MAX_SEARCH_QUERY_LENGTH);
  const category = normalizeShortValue(params.get("category"));
  const city = normalizeShortValue(params.get("city"));
  const verticalParam = normalizeShortValue(params.get("vertical"));
  const vertical =
    verticalParam && businessVerticals.includes(verticalParam as BusinessVertical)
      ? (verticalParam as BusinessVertical)
      : undefined;

  if (verticalParam && !vertical) {
    return {
      ok: false,
      code: "INVALID_QUERY",
      message: "Invalid business vertical.",
    };
  }

  const limit = parsePositiveNumber(params.get("limit"), DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return {
      ok: false,
      code: "INVALID_QUERY",
      message: `Limit must be between 1 and ${MAX_LIMIT}.`,
    };
  }

  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const radiusParam = params.get("radius");
  const hasLocationInput = latParam !== null || lngParam !== null;
  const latitude = latParam === null ? undefined : Number(latParam);
  const longitude = lngParam === null ? undefined : Number(lngParam);

  if (hasLocationInput) {
    if (
      latitude === undefined ||
      longitude === undefined ||
      !hasValidCoordinates({ latitude, longitude })
    ) {
      return {
        ok: false,
        code: "INVALID_LOCATION",
        message: "Invalid location coordinates.",
      };
    }
  }

  const radiusKm =
    radiusParam === null
      ? DEFAULT_NEARBY_RADIUS_KM
      : parsePositiveNumber(radiusParam, Number.NaN);

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    return {
      ok: false,
      code: "INVALID_LOCATION",
      message: `Radius must be between 1 and ${MAX_RADIUS_KM} kilometers.`,
    };
  }

  return {
    ok: true,
    value: {
      query,
      category,
      city,
      vertical,
      latitude,
      longitude,
      radiusKm,
      limit,
    },
  };
}

function normalizeShortValue(value: string | null, max = MAX_SHORT_FILTER_LENGTH) {
  const normalized = value?.trim().slice(0, max);
  return normalized || undefined;
}

function parsePositiveNumber(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  return Number(value);
}

function mobileError(
  code: MobileApiErrorCode,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
