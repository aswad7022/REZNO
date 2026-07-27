"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";

type LocationStatus = "idle" | "loading" | "denied" | "unavailable" | "active";

interface LocationPermissionButtonProps {
  labels: Record<LocationStatus, string>;
}

export function LocationPermissionButton({
  labels,
}: LocationPermissionButtonProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasLocation =
    searchParams.has("lat") && searchParams.has("lng");
  const [status, setStatus] = useState<LocationStatus>(
    hasLocation ? "active" : "idle",
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        aria-describedby={
          status === "denied" || status === "unavailable"
            ? "marketplace-location-status"
            : undefined
        }
        aria-busy={status === "loading"}
        disabled={status === "loading"}
        type="button"
        variant={hasLocation ? "default" : "outline"}
        onClick={() => {
          if (!navigator.geolocation) {
            setStatus("unavailable");
            return;
          }
          setStatus("loading");
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("lat", position.coords.latitude.toString());
              params.set("lng", position.coords.longitude.toString());
              params.set("radius", params.get("radius") ?? "10");
              router.push(`/marketplace?${params.toString()}`);
              setStatus("active");
            },
            () => setStatus("denied"),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
          );
        }}
      >
        {status === "loading" ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <LocateFixed aria-hidden="true" />
        )}
        {labels[status]}
      </Button>
      {status === "denied" || status === "unavailable" ? (
        <p
          className="rezno-status-warning max-w-sm rounded-xl border px-3 py-2 text-center text-xs"
          id="marketplace-location-status"
          role="status"
        >
          {labels[status]}
        </p>
      ) : null}
    </div>
  );
}
