import { useEffect, useRef, useState } from "react";

type RoutePoint = { lat: number; lng: number; label?: string };

let mapsLoader: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string) {
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
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

export function RoutePreviewMap({ start, stops, encodedPolyline, fallbackSrc, alt }: {
  start: RoutePoint;
  stops: RoutePoint[];
  encodedPolyline?: string;
  fallbackSrc?: string | null;
  alt: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    let map: any = null;
    let polyline: any = null;
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
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(start);
      markers.push(new google.maps.Marker({ map, position: start, title: "Start", label: "S" }));
      stops.forEach((stop, index) => {
        bounds.extend(stop);
        markers.push(new google.maps.Marker({ map, position: stop, title: stop.label, label: String(index + 1) }));
      });
      const path = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : [start, ...stops];
      polyline = new google.maps.Polyline({ map, path, strokeColor: "#818cf8", strokeOpacity: 0.95, strokeWeight: 5 });
      map.fitBounds(bounds, 40);
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
      polyline?.setMap(null);
      if (map) (window as any).google?.maps?.event?.clearInstanceListeners(map);
    };
  }, [apiKey, start.lat, start.lng, stops, encodedPolyline]);

  if (!apiKey || failed) {
    return fallbackSrc ? <img src={fallbackSrc} alt={alt} className="h-64 w-full bg-slate-950 object-cover sm:h-72" /> : null;
  }
  return <div ref={containerRef} role="img" aria-label={alt} className="h-64 w-full bg-slate-950 sm:h-72" />;
}
