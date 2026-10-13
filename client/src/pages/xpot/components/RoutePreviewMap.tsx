import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type RoutePoint = { lat: number; lng: number; label?: string };

let mapsLoader: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string) {
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    const callbackName = "__xpotGoogleMapsReady";
    const browserWindow = window as any;
    const script = document.createElement("script");
    const cleanup = () => { delete browserWindow[callbackName]; };
    browserWindow[callbackName] = () => {
      cleanup();
      resolve();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      mapsLoader = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

// Google returns a compact encoded road polyline; decoding it locally avoids a
// second directions request (and therefore a second billable route call).
export function decodeGooglePolyline(encoded: string) {
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function RoutePreviewMap({ start, stops, encodedPolyline, alt, showCurrentLocation = false }: {
  start: RoutePoint;
  stops: RoutePoint[];
  encodedPolyline?: string;
  alt: string;
  showCurrentLocation?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    let map: any = null;
    let polyline: any = null;
    let currentLocationMarker: any = null;
    let locationWatchId: number | undefined;
    const markers: any[] = [];
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current) return;
      const google = (window as any).google;
      map = new google.maps.Map(containerRef.current, {
        center: start,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        mapTypeControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0f1729" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#0f1729" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#273449" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#07101f" }] },
        ],
      });
      const path = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : [start, ...stops];
      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      stops.forEach((stop, index) => {
        markers.push(new google.maps.Marker({ map, position: stop, title: stop.label, label: String(index + 1) }));
      });
      polyline = new google.maps.Polyline({ map, path, strokeColor: "#818cf8", strokeOpacity: 0.95, strokeWeight: 5 });
      map.fitBounds(bounds, 40);

      if (showCurrentLocation && navigator.geolocation) {
        locationWatchId = navigator.geolocation.watchPosition((position) => {
          if (cancelled || !map) return;
          const current = { lat: position.coords.latitude, lng: position.coords.longitude };
          if (!currentLocationMarker) {
            currentLocationMarker = new google.maps.Marker({
              map,
              position: current,
              title: "Current location",
              zIndex: 1000,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: "#2563eb",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
                scale: 8,
              },
            });
          } else {
            currentLocationMarker.setPosition(current);
          }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 });
      }
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (locationWatchId !== undefined) navigator.geolocation.clearWatch(locationWatchId);
      markers.forEach((marker) => marker.setMap(null));
      currentLocationMarker?.setMap(null);
      polyline?.setMap(null);
      if (map) (window as any).google?.maps?.event?.clearInstanceListeners(map);
    };
  }, [apiKey, start.lat, start.lng, stops, encodedPolyline, showCurrentLocation]);

  if (!apiKey || failed) {
    return <MapLibreRouteMap start={start} stops={stops} encodedPolyline={encodedPolyline} alt={alt} showCurrentLocation={showCurrentLocation} />;
  }
  return <div ref={containerRef} role="img" aria-label={alt} className="h-64 w-full bg-slate-950 sm:h-72" />;
}

function MapLibreRouteMap({ start, stops, encodedPolyline, alt, showCurrentLocation }: {
  start: RoutePoint;
  stops: RoutePoint[];
  encodedPolyline?: string;
  alt: string;
  showCurrentLocation: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;
    let currentLocationMarker: import("maplibre-gl").Marker | null = null;
    let locationWatchId: number | undefined;
    const markers: import("maplibre-gl").Marker[] = [];

    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !containerRef.current) return;
      const routePoints = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : [start, ...stops];
      const allPoints = routePoints.length ? routePoints : [start, ...stops];
      const bounds = allPoints.reduce(
        (current, point) => current.extend([point.lng, point.lat]),
        new maplibregl.LngLatBounds([start.lng, start.lat], [start.lng, start.lat]),
      );

      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            openstreetmap: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
              maxzoom: 19,
            },
          },
          layers: [{ id: "openstreetmap", type: "raster", source: "openstreetmap" }],
        },
        bounds: allPoints.length > 1 ? bounds : undefined,
        fitBoundsOptions: { padding: 44, maxZoom: 15 },
        center: allPoints.length === 1 ? [start.lng, start.lat] : undefined,
        zoom: allPoints.length === 1 ? 14 : undefined,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        if (!map || cancelled) return;
        map.addSource("route-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: routePoints.map((point) => [point.lng, point.lat]) },
          },
        });
        map.addLayer({ id: "route-line-shadow", type: "line", source: "route-line", paint: { "line-color": "#1e293b", "line-width": 9, "line-opacity": 0.45 } });
        map.addLayer({ id: "route-line", type: "line", source: "route-line", paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.95 } });

        stops.forEach((point, index) => {
          const marker = document.createElement("div");
          marker.textContent = String(index + 1);
          marker.title = point.label ?? `Stop ${index + 1}`;
          marker.style.cssText = "display:flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:9999px;background:#4f46e5;border:2px solid white;color:white;font:700 11px/1 system-ui;box-shadow:0 3px 10px rgba(15,23,42,.4);";
          markers.push(new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map!));
        });

        if (showCurrentLocation && navigator.geolocation) {
          locationWatchId = navigator.geolocation.watchPosition((position) => {
            if (cancelled || !map) return;
            const current: [number, number] = [position.coords.longitude, position.coords.latitude];
            if (!currentLocationMarker) {
              const marker = document.createElement("div");
              marker.title = "Current location";
              marker.setAttribute("aria-label", "Current location");
              marker.style.cssText = "width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,.22),0 4px 14px rgba(15,23,42,.45);";
              currentLocationMarker = new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat(current).addTo(map);
            } else {
              currentLocationMarker.setLngLat(current);
            }
          }, () => {}, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 });
        }

        map.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 0 });
      });
    }).catch(() => setUnavailable(true));

    return () => {
      cancelled = true;
      if (locationWatchId !== undefined) navigator.geolocation.clearWatch(locationWatchId);
      markers.forEach((marker) => marker.remove());
      currentLocationMarker?.remove();
      map?.remove();
    };
  }, [start.lat, start.lng, stops, encodedPolyline, showCurrentLocation]);

  if (unavailable) return <div role="img" aria-label={alt} className="flex h-64 w-full items-center justify-center bg-slate-100 text-sm font-medium text-slate-500 sm:h-72">Map unavailable</div>;
  return <div ref={containerRef} role="img" aria-label={alt} className="h-64 w-full bg-slate-100 sm:h-72" />;
}
