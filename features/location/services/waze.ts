import { hasValidCoordinates } from "@/features/location/services/distance";
import type { Coordinates } from "@/features/location/types";

export function buildWazeNavigationUrl(
  coordinates: Partial<Coordinates>,
): string | null {
  if (!hasValidCoordinates(coordinates)) return null;

  const latitude = encodeURIComponent(coordinates.latitude.toFixed(6));
  const longitude = encodeURIComponent(coordinates.longitude.toFixed(6));

  return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes&utm_source=rezno`;
}
