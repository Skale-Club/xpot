import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type RoutePoint = {
  lat: number;
  lng: number;
  id?: number;
  label?: string;
  markerColor?: string;
  markerBorderColor?: string;
  markerTextColor?: string;
};

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

function distanceSquared(a: RoutePoint, b: RoutePoint) {
  const lat = a.lat - b.lat;
  const lng = a.lng - b.lng;
  return lat * lat + lng * lng;
}

function createLocateButton(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.style.cssText = "position:absolute;z-index:3;top:12px;left:12px;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid rgba(148,163,184,.45);border-radius:10px;background:rgba(255,255,255,.96);color:#1e293b;box-shadow:0 3px 12px rgba(15,23,42,.28);cursor:pointer;";
  button.innerHTML = '<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path><circle cx="12" cy="12" r="8"></circle></svg>';
  button.addEventListener("click", onClick);
  return button;
}

/** Removes a legacy navigation leg before visit one (and after the last visit). */
export function trimRoutePathToStops(path: RoutePoint[], stops: RoutePoint[]) {
  if (!stops.length) return [];
  if (stops.length === 1) return [stops[0]];
  if (!path.length) return stops;

  const firstIndex = path.reduce((best, point, index) =>
    distanceSquared(point, stops[0]) < distanceSquared(path[best], stops[0]) ? index : best, 0);
  let lastIndex = firstIndex;
  for (let index = firstIndex; index < path.length; index++) {
    if (distanceSquared(path[index], stops[stops.length - 1]) < distanceSquared(path[lastIndex], stops[stops.length - 1])) {
      lastIndex = index;
    }
  }
  const visible = path.slice(firstIndex, lastIndex + 1);
  return visible.length > 1 ? visible : stops;
}

export function RoutePreviewMap({ start, stops, encodedPolyline, alt, showCurrentLocation = false, locateLabel = "Show my location", onStopClick, className }: {
  start: RoutePoint;
  stops: RoutePoint[];
  encodedPolyline?: string;
  alt: string;
  showCurrentLocation?: boolean;
  locateLabel?: string;
  onStopClick?: (stopId: number) => void;
  className?: string;
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
    let currentLocation: RoutePoint | null = null;
    let locateButton: HTMLButtonElement | null = null;
    let locationWatchId: number | undefined;
    const markers: any[] = [];
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current) return;
      const google = (window as any).google;
      const visibleStops = stops.length ? stops : [start];
      map = new google.maps.Map(containerRef.current, {
        center: visibleStops[0],
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
      const decodedPath = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : stops;
      const path = trimRoutePathToStops(decodedPath, visibleStops);
      const bounds = new google.maps.LatLngBounds();
      visibleStops.forEach((point) => bounds.extend(point));
      stops.forEach((stop, index) => {
        const marker = new google.maps.Marker({
          map,
          position: stop,
          title: stop.label,
          zIndex: 10 + stops.length - index,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: stop.markerColor ?? "#1f2937",
            fillOpacity: 1,
            strokeColor: stop.markerBorderColor ?? "#64748b",
            strokeWeight: 2,
            scale: 14,
          },
          label: {
            text: String(index + 1),
            color: stop.markerTextColor ?? "#ffffff",
            fontSize: "11px",
            fontWeight: "700",
          },
        });
        if (stop.id !== undefined && onStopClick) marker.addListener("click", () => onStopClick(stop.id!));
        markers.push(marker);
      });
      polyline = new google.maps.Polyline({
        map,
        path,
        strokeColor: "#6674ff",
        strokeOpacity: 1,
        strokeWeight: 7,
        zIndex: 4,
      });
      map.fitBounds(bounds, 40);

      if (showCurrentLocation && navigator.geolocation) {
        const focusCurrentLocation = (current: RoutePoint) => {
          map.panTo(current);
          if ((map.getZoom?.() ?? 0) < 14) map.setZoom(14);
        };
        locateButton = createLocateButton(locateLabel, () => {
          if (currentLocation) return focusCurrentLocation(currentLocation);
          navigator.geolocation.getCurrentPosition((position) => {
            currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            focusCurrentLocation(currentLocation);
          }, () => {}, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 });
        });
        containerRef.current.appendChild(locateButton);
        locationWatchId = navigator.geolocation.watchPosition((position) => {
          if (cancelled || !map) return;
          const current = { lat: position.coords.latitude, lng: position.coords.longitude };
          currentLocation = current;
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
      locateButton?.remove();
      polyline?.setMap(null);
      if (map) (window as any).google?.maps?.event?.clearInstanceListeners(map);
    };
  }, [apiKey, start.lat, start.lng, stops, encodedPolyline, showCurrentLocation, locateLabel, onStopClick]);

  if (!apiKey || failed) {
    return <MapLibreRouteMap start={start} stops={stops} encodedPolyline={encodedPolyline} alt={alt} showCurrentLocation={showCurrentLocation} locateLabel={locateLabel} onStopClick={onStopClick} className={className} />;
  }
  return <div ref={containerRef} role="img" aria-label={alt} className={`h-64 w-full bg-slate-950 sm:h-72 ${className ?? ""}`} />;
}

function MapLibreRouteMap({ start, stops, encodedPolyline, alt, showCurrentLocation, locateLabel, onStopClick, className }: {
  start: RoutePoint;
  stops: RoutePoint[];
  encodedPolyline?: string;
  alt: string;
  showCurrentLocation: boolean;
  locateLabel: string;
  onStopClick?: (stopId: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;
    let currentLocationMarker: import("maplibre-gl").Marker | null = null;
    let currentLocation: [number, number] | null = null;
    let locateButton: HTMLButtonElement | null = null;
    let routeOverlay: SVGSVGElement | null = null;
    let renderRouteOverlay: (() => void) | null = null;
    let locationWatchId: number | undefined;
    const markers: import("maplibre-gl").Marker[] = [];

    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !containerRef.current) return;
      const visibleStops = stops.length ? stops : [start];
      const decodedPath = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : stops;
      const routePoints = trimRoutePathToStops(decodedPath, visibleStops);
      const bounds = visibleStops.reduce(
        (current, point) => current.extend([point.lng, point.lat]),
        new maplibregl.LngLatBounds([visibleStops[0].lng, visibleStops[0].lat], [visibleStops[0].lng, visibleStops[0].lat]),
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
        bounds: visibleStops.length > 1 ? bounds : undefined,
        fitBoundsOptions: { padding: 44, maxZoom: 15 },
        center: visibleStops.length === 1 ? [visibleStops[0].lng, visibleStops[0].lat] : undefined,
        zoom: visibleStops.length === 1 ? 14 : undefined,
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
        if (routePoints.length > 1) {
          const svgNamespace = "http://www.w3.org/2000/svg";
          routeOverlay = document.createElementNS(svgNamespace, "svg");
          routeOverlay.setAttribute("aria-hidden", "true");
          routeOverlay.style.cssText = "position:absolute;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;overflow:visible;";
          const casing = document.createElementNS(svgNamespace, "polyline");
          casing.setAttribute("fill", "none");
          casing.setAttribute("stroke", "rgba(255,255,255,.94)");
          casing.setAttribute("stroke-width", "8");
          casing.setAttribute("stroke-linecap", "round");
          casing.setAttribute("stroke-linejoin", "round");
          const routeLine = document.createElementNS(svgNamespace, "polyline");
          routeLine.setAttribute("fill", "none");
          routeLine.setAttribute("stroke", "#4f46e5");
          routeLine.setAttribute("stroke-width", "4");
          routeLine.setAttribute("stroke-linecap", "round");
          routeLine.setAttribute("stroke-linejoin", "round");
          routeOverlay.append(casing, routeLine);
          map.getContainer().appendChild(routeOverlay);
          renderRouteOverlay = () => {
            if (!map || !routeOverlay) return;
            const { clientWidth, clientHeight } = map.getContainer();
            routeOverlay.setAttribute("viewBox", `0 0 ${clientWidth} ${clientHeight}`);
            const points = routePoints.map((point) => {
              const pixel = map!.project([point.lng, point.lat]);
              return `${pixel.x},${pixel.y}`;
            }).join(" ");
            casing.setAttribute("points", points);
            routeLine.setAttribute("points", points);
          };
          renderRouteOverlay();
          map.on("move", renderRouteOverlay);
          map.on("resize", renderRouteOverlay);
        }

        stops.forEach((point, index) => {
          const marker = document.createElement("button");
          marker.type = "button";
          marker.textContent = String(index + 1);
          marker.title = point.label ?? `Stop ${index + 1}`;
          marker.setAttribute("aria-label", point.label ?? `Stop ${index + 1}`);
          marker.style.cssText = `display:flex;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border-radius:9999px;background:${point.markerColor ?? "#1f2937"};border:2px solid ${point.markerBorderColor ?? "#64748b"};color:${point.markerTextColor ?? "#ffffff"};font:700 11px/1 system-ui;box-shadow:0 3px 10px rgba(15,23,42,.4);cursor:pointer;`;
          marker.style.zIndex = String(10 + stops.length - index);
          if (point.id !== undefined && onStopClick) marker.addEventListener("click", (event) => {
            event.stopPropagation();
            onStopClick(point.id!);
          });
          markers.push(new maplibregl.Marker({ element: marker, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map!));
        });

        if (showCurrentLocation && navigator.geolocation) {
          const focusCurrentLocation = (current: [number, number]) => {
            map?.easeTo({ center: current, zoom: Math.max(map.getZoom(), 14), duration: 450 });
          };
          locateButton = createLocateButton(locateLabel, () => {
            if (currentLocation) return focusCurrentLocation(currentLocation);
            navigator.geolocation.getCurrentPosition((position) => {
              currentLocation = [position.coords.longitude, position.coords.latitude];
              focusCurrentLocation(currentLocation);
            }, () => {}, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 });
          });
          map.getContainer().appendChild(locateButton);
          locationWatchId = navigator.geolocation.watchPosition((position) => {
            if (cancelled || !map) return;
            const current: [number, number] = [position.coords.longitude, position.coords.latitude];
            currentLocation = current;
            if (!currentLocationMarker) {
              const marker = document.createElement("div");
              marker.title = "Current location";
              marker.setAttribute("aria-label", "Current location");
              marker.style.cssText = "width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,.22),0 4px 14px rgba(15,23,42,.45);";
              marker.style.zIndex = "2";
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
      locateButton?.remove();
      if (map && renderRouteOverlay) {
        map.off("move", renderRouteOverlay);
        map.off("resize", renderRouteOverlay);
      }
      routeOverlay?.remove();
      map?.remove();
    };
  }, [start.lat, start.lng, stops, encodedPolyline, showCurrentLocation, locateLabel, onStopClick]);

  if (unavailable) return <div role="img" aria-label={alt} className={`flex h-64 w-full items-center justify-center bg-slate-100 text-sm font-medium text-slate-500 sm:h-72 ${className ?? ""}`}>Map unavailable</div>;
  return <div ref={containerRef} role="img" aria-label={alt} className={`h-64 w-full bg-slate-100 sm:h-72 ${className ?? ""}`} />;
}
