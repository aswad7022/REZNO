export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface MapMarker extends Coordinates {
  id: string;
  title: string;
  description?: string | null;
  href?: string;
  ctaLabel?: string;
  distanceKm?: number | null;
  landmark?: string | null;
  wazeUrl?: string | null;
}

export interface NearbySearchInput extends Coordinates {
  radiusKm: number;
  query?: string;
  category?: string;
  vertical?: string;
  take?: number;
}
