"use client";

import { useCallback, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationMap } from "@/features/location/components/location-map";
import { mapProviderConfig } from "@/features/location/config/map-provider";
import type { Coordinates } from "@/features/location/types";

interface LocationPickerProps {
  latitudeName?: string;
  longitudeName?: string;
  defaultLatitude?: string | null;
  defaultLongitude?: string | null;
  labels: {
    latitude: string;
    longitude: string;
    chooseOnMap: string;
    movePin: string;
    mapData: string;
  };
}

export function LocationPicker({
  latitudeName = "latitude",
  longitudeName = "longitude",
  defaultLatitude,
  defaultLongitude,
  labels,
}: LocationPickerProps) {
  const [latitude, setLatitude] = useState(defaultLatitude ?? "");
  const [longitude, setLongitude] = useState(defaultLongitude ?? "");

  const center = useMemo<Coordinates | null>(() => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)) {
      return { latitude: parsedLatitude, longitude: parsedLongitude };
    }
    return mapProviderConfig.defaultCenter;
  }, [latitude, longitude]);

  const handleChange = useCallback((coordinates: Coordinates) => {
    setLatitude(coordinates.latitude.toFixed(6));
    setLongitude(coordinates.longitude.toFixed(6));
  }, []);

  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <p className="text-sm font-medium">{labels.chooseOnMap}</p>
        <p className="mt-1 text-xs text-muted-foreground">{labels.movePin}</p>
      </div>
      <LocationMap
        center={center}
        interactive
        onChange={handleChange}
        className="h-80 overflow-hidden rounded-3xl border border-primary/10 bg-muted"
      />
      <p className="text-xs text-muted-foreground">{labels.mapData}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={latitudeName}>{labels.latitude}</Label>
          <Input
            id={latitudeName}
            name={latitudeName}
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            inputMode="decimal"
            dir="ltr"
            placeholder="33.315200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={longitudeName}>{labels.longitude}</Label>
          <Input
            id={longitudeName}
            name={longitudeName}
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            inputMode="decimal"
            dir="ltr"
            placeholder="44.366100"
          />
        </div>
      </div>
    </div>
  );
}
