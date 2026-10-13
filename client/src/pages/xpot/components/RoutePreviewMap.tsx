import { useEffect, useRef, useState } from "react";

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

export function RoutePreviewMap({ start, stops, encodedPolyline, fallbackSrc, alt }: {
  start: RoutePoint;
  stops: RoutePoint[];
  encodedPolyline?: string;
  fallbackSrc?: string | null;
  alt: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => setFallbackFailed(false), [fallbackSrc]);

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
    if (fallbackSrc && !fallbackFailed) {
      return <img src={fallbackSrc} alt={alt} onError={() => setFallbackFailed(true)} className="h-64 w-full bg-slate-950 object-cover sm:h-72" />;
    }
    return <RouteDiagram start={start} stops={stops} alt={alt} />;
  }
  return <div ref={containerRef} role="img" aria-label={alt} className="h-64 w-full bg-slate-950 sm:h-72" />;
}

function RouteDiagram({ start, stops, alt }: { start: RoutePoint; stops: RoutePoint[]; alt: string }) {
  const points = [start, ...stops];
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(0.001, maxLat - minLat);
  const lngSpan = Math.max(0.001, maxLng - minLng);
  const plotted = points.map((point) => ({
    x: 56 + ((point.lng - minLng) / lngSpan) * 688,
    y: 272 - ((point.lat - minLat) / latSpan) * 224,
  }));
  const routePath = plotted.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg role="img" aria-label={alt} viewBox="0 0 800 320" className="h-64 w-full bg-[#070d19] sm:h-72" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="route-map-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#111a2c" />
          <stop offset="1" stopColor="#08111f" />
        </linearGradient>
        <filter id="route-line-glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="800" height="320" fill="url(#route-map-glow)" />
      {[72, 144, 216, 288].map((y) => <path key={`h-${y}`} d={`M0 ${y} C180 ${y - 28}, 320 ${y + 30}, 800 ${y - 8}`} fill="none" stroke="#253248" strokeWidth="1" opacity="0.45" />)}
      {[130, 280, 430, 590, 730].map((x) => <path key={`v-${x}`} d={`M${x} 0 C${x - 45} 90, ${x + 50} 210, ${x - 15} 320`} fill="none" stroke="#1e2b40" strokeWidth="1" opacity="0.42" />)}
      {plotted.length > 1 ? <polyline points={routePath} fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#route-line-glow)" /> : null}
      {plotted.map((point, index) => (
        <g key={`${point.x}-${point.y}-${index}`} transform={`translate(${point.x} ${point.y})`}>
          <circle r={index === 0 ? 12 : 10} fill={index === 0 ? "#14b8a6" : "#6366f1"} stroke="#dbeafe" strokeWidth="2" />
          <text y="4" textAnchor="middle" fill="white" fontSize={index === 0 ? 9 : 10} fontWeight="700">{index === 0 ? "S" : index}</text>
        </g>
      ))}
    </svg>
  );
}
