"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed } from "lucide-react";

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
        aria-live="polite"
      >
        <LocateFixed />
        {labels[status]}
      </Button>
      {status === "denied" || status === "unavailable" ? (
        <p className="text-center text-xs text-muted-foreground">
          {labels[status]}
        </p>
      ) : null}
    </div>
  );
}
