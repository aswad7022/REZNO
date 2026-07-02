import type { Coordinates } from "@/features/location/types";

const EARTH_RADIUS_KM = 6371;

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function hasValidCoordinates(
  value: Partial<Coordinates>,
): value is Coordinates {
  return (
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    isValidLatitude(value.latitude) &&
    isValidLongitude(value.longitude)
  );
}

export function calculateDistanceKm(
  origin: Coordinates,
  destination: Coordinates,
): number {
  if (!hasValidCoordinates(origin) || !hasValidCoordinates(destination)) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getBoundingBox({
  latitude,
  longitude,
  radiusKm,
}: Coordinates & { radiusKm: number }) {
  const latDelta = radiusKm / 111.32;
  const lngDelta =
    radiusKm / (111.32 * Math.cos(toRadians(latitude)) || 1);

  return {
    minLatitude: Math.max(-90, latitude - latDelta),
    maxLatitude: Math.min(90, latitude + latDelta),
    minLongitude: Math.max(-180, longitude - lngDelta),
    maxLongitude: Math.min(180, longitude + lngDelta),
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
