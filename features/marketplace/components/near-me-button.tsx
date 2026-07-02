"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NearMeButton({ label }: { label: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "loading" | "denied">("idle");

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (!navigator.geolocation) {
          setStatus("denied");
          return;
        }
        setStatus("loading");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("lat", position.coords.latitude.toString());
            params.set("lng", position.coords.longitude.toString());
            router.push(`/marketplace?${params.toString()}`);
            setStatus("idle");
          },
          () => setStatus("denied"),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
        );
      }}
      aria-live="polite"
    >
      <LocateFixed />
      {status === "loading" ? "..." : status === "denied" ? label : label}
    </Button>
  );
}
