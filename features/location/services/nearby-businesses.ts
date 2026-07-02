import "server-only";

import type { Prisma } from "@prisma/client";

import { getBoundingBox, hasValidCoordinates } from "@/features/location/services/distance";
import type { NearbySearchInput } from "@/features/location/types";

export const NEARBY_RADIUS_OPTIONS_KM = [1, 3, 5, 10, 25] as const;
export const DEFAULT_NEARBY_RADIUS_KM = 10;
export const MAX_NEARBY_RESULTS = 50;

export function normalizeNearbyInput(
  input: Partial<NearbySearchInput>,
): NearbySearchInput | null {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!hasValidCoordinates({ latitude, longitude })) return null;

  const requestedRadius = Number(input.radiusKm);
  const radiusKm = NEARBY_RADIUS_OPTIONS_KM.includes(
    requestedRadius as (typeof NEARBY_RADIUS_OPTIONS_KM)[number],
  )
    ? requestedRadius
    : DEFAULT_NEARBY_RADIUS_KM;

  return {
    latitude,
    longitude,
    radiusKm,
    query: input.query,
    category: input.category,
    vertical: input.vertical,
    take: Math.min(input.take ?? MAX_NEARBY_RESULTS, MAX_NEARBY_RESULTS),
  };
}

export function getNearbyBranchWhere(
  input: NearbySearchInput,
): Prisma.BranchWhereInput {
  const bounds = getBoundingBox(input);

  return {
    deletedAt: null,
    status: "ACTIVE",
    latitude: {
      not: null,
      gte: bounds.minLatitude,
      lte: bounds.maxLatitude,
    },
    longitude: {
      not: null,
      gte: bounds.minLongitude,
      lte: bounds.maxLongitude,
    },
  };
}
