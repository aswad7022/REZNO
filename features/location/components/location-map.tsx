"use client";

import { useEffect, useId, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

import { mapProviderConfig } from "@/features/location/config/map-provider";
import type { Coordinates, MapMarker } from "@/features/location/types";

interface LocationMapProps {
  center?: Coordinates | null;
  markers?: MapMarker[];
  interactive?: boolean;
  onChange?: (coordinates: Coordinates) => void;
  className?: string;
}

export function LocationMap({
  center,
  markers = [],
  interactive = false,
  onChange,
  className,
}: LocationMapProps) {
  const id = useId();
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const iconRef = useRef<Leaflet.Icon | Leaflet.DivIcon | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerGroupRef = useRef<Leaflet.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<Leaflet.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const resolvedCenter = center ?? mapProviderConfig.defaultCenter;

  useEffect(() => {
    let disposed = false;

    async function initializeMap() {
      const L = await import("leaflet");
      if (disposed) return;

      leafletRef.current = L;
      iconRef.current = L.divIcon({
        className: "",
        html: '<span class="block size-5 rounded-full border-2 border-white bg-primary shadow-lg ring-4 ring-primary/20"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const map = L.map(id, {
        center: [resolvedCenter.latitude, resolvedCenter.longitude],
        zoom: center ? 15 : mapProviderConfig.defaultZoom,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer(mapProviderConfig.tileUrl, {
        attribution: mapProviderConfig.attribution,
        maxZoom: mapProviderConfig.maxZoom,
      }).addTo(map);

      markerGroupRef.current = L.layerGroup().addTo(map);
      setReady(true);

      if (interactive) {
        const icon = iconRef.current;
        pickerMarkerRef.current = L.marker(
          [resolvedCenter.latitude, resolvedCenter.longitude],
          { draggable: true, icon: icon ?? undefined },
        ).addTo(map);

        pickerMarkerRef.current.on("dragend", () => {
          const position = pickerMarkerRef.current?.getLatLng();
          if (position) {
            onChange?.({ latitude: position.lat, longitude: position.lng });
          }
        });

        map.on("click", (event: Leaflet.LeafletMouseEvent) => {
          pickerMarkerRef.current?.setLatLng(event.latlng);
          onChange?.({
            latitude: event.latlng.lat,
            longitude: event.latlng.lng,
          });
        });
      }
    }

    void initializeMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerGroupRef.current = null;
      pickerMarkerRef.current = null;
      leafletRef.current = null;
      iconRef.current = null;
      setReady(false);
    };
  }, [
    center,
    id,
    interactive,
    onChange,
    resolvedCenter.latitude,
    resolvedCenter.longitude,
  ]);

  useEffect(() => {
    const L = leafletRef.current;
    const icon = iconRef.current;
    const group = markerGroupRef.current;
    if (!ready || !L || !icon || !group || interactive) return;
    group.clearLayers();

    const bounds = L.latLngBounds([]);
    for (const marker of markers) {
      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon,
      });
      leafletMarker.bindPopup(renderPopup(marker));
      leafletMarker.addTo(group);
      bounds.extend([marker.latitude, marker.longitude]);
    }

    if (markers.length > 1) {
      mapRef.current?.fitBounds(bounds, { padding: [24, 24] });
    } else if (markers.length === 1) {
      mapRef.current?.setView(
        [markers[0].latitude, markers[0].longitude],
        14,
      );
    }
  }, [interactive, markers, ready]);

  return (
    <div
      id={id}
      className={
        className ??
        "min-h-80 overflow-hidden rounded-3xl border border-primary/10 bg-muted"
      }
    />
  );
}

function renderPopup(marker: MapMarker): string {
  const parts = [
    `<strong>${escapeHtml(marker.title)}</strong>`,
    marker.description ? `<p>${escapeHtml(marker.description)}</p>` : "",
    marker.landmark ? `<p>${escapeHtml(marker.landmark)}</p>` : "",
    typeof marker.distanceKm === "number"
      ? `<p>${marker.distanceKm.toFixed(1)} km</p>`
      : "",
    marker.href
      ? `<a href="${escapeAttribute(marker.href)}">${escapeHtml(
          marker.ctaLabel ?? marker.title,
        )}</a>`
      : "",
    marker.wazeUrl
      ? `<br><a href="${escapeAttribute(
          marker.wazeUrl,
        )}" target="_blank" rel="noopener noreferrer">Waze</a>`
      : "",
  ];

  return `<div class="space-y-1 text-sm">${parts.join("")}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
