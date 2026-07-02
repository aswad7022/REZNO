"use client";

import dynamic from "next/dynamic";

import type { MapMarker } from "@/features/location/types";

const LocationMap = dynamic(
  () =>
    import("@/features/location/components/location-map").then(
      (module) => module.LocationMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-80 animate-pulse rounded-3xl border border-primary/10 bg-muted" />
    ),
  },
);

export function NearbyBusinessMap({ markers }: { markers: MapMarker[] }) {
  return <LocationMap markers={markers} />;
}
