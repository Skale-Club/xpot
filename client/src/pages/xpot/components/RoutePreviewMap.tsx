import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useT, type Lang } from "@/i18n";
import { prospectingMessages } from "@/i18n/messages/prospecting";
import { prospectingUiMessages } from "@/i18n/messages/prospectingUi";
import { MAP_POINT_TONES } from "../prospectingUi";
import { MapSkeleton, MapUnavailable, MAP_SURFACE_CLASS } from "./MapStatus";

type RoutePoint = {
  lat: number;
  lng: number;
  id?: number;
  label?: string;
  markerColor?: string;
  markerBorderColor?: string;
  markerTextColor?: string;
  /** Text inside the marker; the stop number when omitted (a check or skip glyph for finished stops). */
  markerText?: string;
};

/** A point on the route that is not a stop: where it starts (when that is not stop 1) and the rep's home. */
export type RouteLandmark = { kind: "start" | "home"; lat: number; lng: number };

/**
 * Line and marker look shared by the Google map and the MapLibre fallback, so
 * the route reads the same whichever one draws it.
 */
export const ROUTE_MAP = {
  line: "#6674ff",
  lineWidth: 5,
  casing: "rgba(6,9,18,0.85)",
  casingWidth: 9,
  /** Stop marker diameter in px. */
  markerSize: 28,
  /** Start / home marker diameter in px. */
  landmarkSize: 24,
  markerFont: "700 11px/1 system-ui, sans-serif",
  markerShadow: "0 3px 10px rgba(15,23,42,.45)",
  /** Both maps: one finger scrolls the page on a phone, two fingers move the map. */
  cooperativeGestures: true,
} as const;

/** The glyph inside the start and home markers. */
const LANDMARK_GLYPH: Record<RouteLandmark["kind"], string> = { start: "▸", home: "⌂" };

const GOOGLE_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0f1729" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1729" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#273449" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#07101f" }] },
];

/**
 * OpenStreetMap only serves light tiles; these raster settings invert and
 * desaturate them into the same dark navy as the Google style.
 */
const MAPLIBRE_DARK_PAINT = {
  "raster-brightness-min": 0.72,
  "raster-brightness-max": 0.06,
  "raster-hue-rotate": 180,
  "raster-saturation": -0.55,
  "raster-contrast": 0.1,
} as const;

let mapsLoader: Promise<void> | null = null;

/**
 * Google's language for its controls ("Zoom in") and map labels. The script
 * loads once per page, so a language picked later applies after a reload.
 */
export const GOOGLE_MAPS_LANGUAGE: Record<Lang, string> = { en: "en", pt: "pt-BR", es: "es" };

function loadGoogleMaps(apiKey: string, lang: Lang) {
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&language=${GOOGLE_MAPS_LANGUAGE[lang]}&callback=${callbackName}`;
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

/** The "show my location" button, dark like the map it sits on (40px tap target). */
function createLocateButton(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.style.cssText = "position:absolute;z-index:3;top:12px;left:12px;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(13,19,34,.92);color:#e2e8f0;box-shadow:0 3px 12px rgba(0,0,0,.4);cursor:pointer;";
  button.innerHTML = '<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path><circle cx="12" cy="12" r="8"></circle></svg>';
  button.addEventListener("click", onClick);
  return button;
}

/** A round HTML marker (MapLibre) in the shared look. */
function markerElement(tag: "button" | "div", size: number, colors: { background: string; border: string; text: string }, text: string, label: string) {
  const element = document.createElement(tag);
  if (element instanceof HTMLButtonElement) element.type = "button";
  element.textContent = text;
  element.title = label;
  element.setAttribute("aria-label", label);
  element.style.cssText = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;padding:0;border-radius:9999px;background:${colors.background};border:2px solid ${colors.border};color:${colors.text};font:${ROUTE_MAP.markerFont};box-shadow:${ROUTE_MAP.markerShadow};${tag === "button" ? "cursor:pointer;" : ""}`;
  return element;
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

type MapLabels = { you: string; stop: (number: number) => string; landmark: (kind: RouteLandmark["kind"]) => string };

function useMapLabels(): MapLabels {
  const t = useT(prospectingUiMessages);
  return {
    you: t("yourLocation"),
    stop: (number) => t("stopNumber", { number }),
    landmark: (kind) => (kind === "home" ? t("home") : t("routeStart")),
  };
}

export function RoutePreviewMap({ start, stops, landmarks = [], encodedPolyline, alt, showCurrentLocation = false, locateLabel, onStopClick, className }: {
  start: RoutePoint;
  stops: RoutePoint[];
  /** Start (when it is not stop 1) and home markers. */
  landmarks?: RouteLandmark[];
  encodedPolyline?: string;
  alt: string;
  showCurrentLocation?: boolean;
  locateLabel?: string;
  onStopClick?: (stopId: number) => void;
  className?: string;
}) {
  const tp = useT(prospectingMessages);
  const labels = useMapLabels();
  const locate = locateLabel ?? tp("showMyLocation");
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const landmarkKey = landmarks.map((point) => `${point.kind}:${point.lat},${point.lng}`).join("|");

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    let map: any = null;
    let currentLocationMarker: any = null;
    let currentLocation: RoutePoint | null = null;
    let locateButton: HTMLButtonElement | null = null;
    let locationWatchId: number | undefined;
    const markers: any[] = [];
    const lines: any[] = [];
    loadGoogleMaps(apiKey, tp.lang).then(() => {
      if (cancelled || !containerRef.current) return;
      const google = (window as any).google;
      const visibleStops = stops.length ? stops : [start];
      map = new google.maps.Map(containerRef.current, {
        center: visibleStops[0],
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: ROUTE_MAP.cooperativeGestures ? "cooperative" : "greedy",
        mapTypeControl: false,
        backgroundColor: "#0b1020",
        styles: GOOGLE_DARK_STYLE,
      });
      // "idle" also fires when tiles fail, so the skeleton never covers Google's own error.
      const markReady = () => { if (!cancelled) setReady(true); };
      google.maps.event.addListenerOnce(map, "tilesloaded", markReady);
      google.maps.event.addListenerOnce(map, "idle", markReady);
      const decodedPath = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : stops;
      const path = trimRoutePathToStops(decodedPath, visibleStops);
      const bounds = new google.maps.LatLngBounds();
      visibleStops.forEach((point) => bounds.extend(point));
      landmarks.forEach((point) => bounds.extend(point));
      const radius = (size: number) => size / 2;
      stops.forEach((stop, index) => {
        const marker = new google.maps.Marker({
          map,
          position: stop,
          title: stop.label ?? labels.stop(index + 1),
          zIndex: 10 + stops.length - index,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: stop.markerColor ?? "#1f2937",
            fillOpacity: 1,
            strokeColor: stop.markerBorderColor ?? "#64748b",
            strokeWeight: 2,
            scale: radius(ROUTE_MAP.markerSize),
          },
          label: {
            text: stop.markerText ?? String(index + 1),
            color: stop.markerTextColor ?? "#ffffff",
            fontSize: "11px",
            fontWeight: "700",
          },
        });
        if (stop.id !== undefined && onStopClick) marker.addListener("click", () => onStopClick(stop.id!));
        markers.push(marker);
      });
      landmarks.forEach((point) => {
        const tone = MAP_POINT_TONES[point.kind];
        markers.push(new google.maps.Marker({
          map,
          position: point,
          title: labels.landmark(point.kind),
          zIndex: 5,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: tone.background,
            fillOpacity: 1,
            strokeColor: tone.border,
            strokeWeight: 2,
            scale: radius(ROUTE_MAP.landmarkSize),
          },
          label: { text: LANDMARK_GLYPH[point.kind], color: tone.text, fontSize: "12px", fontWeight: "700" },
        }));
      });
      lines.push(
        new google.maps.Polyline({ map, path, strokeColor: ROUTE_MAP.casing, strokeOpacity: 1, strokeWeight: ROUTE_MAP.casingWidth, zIndex: 3 }),
        new google.maps.Polyline({ map, path, strokeColor: ROUTE_MAP.line, strokeOpacity: 1, strokeWeight: ROUTE_MAP.lineWidth, zIndex: 4 }),
      );
      map.fitBounds(bounds, 40);

      if (showCurrentLocation && navigator.geolocation) {
        const focusCurrentLocation = (current: RoutePoint) => {
          map.panTo(current);
          if ((map.getZoom?.() ?? 0) < 14) map.setZoom(14);
        };
        locateButton = createLocateButton(locate, () => {
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
              title: labels.you,
              zIndex: 1000,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: MAP_POINT_TONES.you.background,
                fillOpacity: 1,
                strokeColor: MAP_POINT_TONES.you.border,
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
      lines.forEach((line) => line.setMap(null));
      if (map) (window as any).google?.maps?.event?.clearInstanceListeners(map);
    };
    // labels only change with the language; the effect keys on what it draws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, start.lat, start.lng, stops, landmarkKey, encodedPolyline, showCurrentLocation, locate, onStopClick]);

  if (!apiKey || failed) {
    return <MapLibreRouteMap start={start} stops={stops} landmarks={landmarks} landmarkKey={landmarkKey} encodedPolyline={encodedPolyline} alt={alt} showCurrentLocation={showCurrentLocation} locateLabel={locate} onStopClick={onStopClick} className={className} labels={labels} />;
  }
  return (
    <div className={`relative h-64 w-full overflow-hidden sm:h-72 ${MAP_SURFACE_CLASS} ${className ?? ""}`}>
      <div ref={containerRef} role="img" aria-label={alt} className="absolute inset-0" />
      {ready ? null : <MapSkeleton className="pointer-events-none absolute inset-0" />}
    </div>
  );
}

function MapLibreRouteMap({ start, stops, landmarks, landmarkKey, encodedPolyline, alt, showCurrentLocation, locateLabel, onStopClick, className, labels }: {
  start: RoutePoint;
  stops: RoutePoint[];
  landmarks: RouteLandmark[];
  landmarkKey: string;
  encodedPolyline?: string;
  alt: string;
  showCurrentLocation: boolean;
  locateLabel: string;
  onStopClick?: (stopId: number) => void;
  className?: string;
  labels: MapLabels;
}) {
  const t = useT(prospectingUiMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);

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
      const bounds = [...visibleStops, ...landmarks].reduce(
        (current, point) => current.extend([point.lng, point.lat]),
        new maplibregl.LngLatBounds([visibleStops[0].lng, visibleStops[0].lat], [visibleStops[0].lng, visibleStops[0].lat]),
      );
      const pointCount = visibleStops.length + landmarks.length;

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
          layers: [
            { id: "background", type: "background", paint: { "background-color": "#0b1020" } },
            { id: "openstreetmap", type: "raster", source: "openstreetmap", paint: MAPLIBRE_DARK_PAINT },
          ],
        },
        bounds: pointCount > 1 ? bounds : undefined,
        fitBoundsOptions: { padding: 44, maxZoom: 15 },
        center: pointCount === 1 ? [visibleStops[0].lng, visibleStops[0].lat] : undefined,
        zoom: pointCount === 1 ? 14 : undefined,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: ROUTE_MAP.cooperativeGestures,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": t("gestureWindows"),
          "CooperativeGesturesHandler.MacHelpText": t("gestureMac"),
          "CooperativeGesturesHandler.MobileHelpText": t("gestureMobile"),
          // The control buttons' titles and labels, English by default.
          "NavigationControl.ZoomIn": t("mapZoomIn"),
          "NavigationControl.ZoomOut": t("mapZoomOut"),
          "AttributionControl.ToggleAttribution": t("mapAttribution"),
        },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        if (!map || cancelled) return;
        setReady(true);
        if (routePoints.length > 1) {
          const svgNamespace = "http://www.w3.org/2000/svg";
          routeOverlay = document.createElementNS(svgNamespace, "svg");
          routeOverlay.setAttribute("aria-hidden", "true");
          routeOverlay.style.cssText = "position:absolute;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;overflow:visible;";
          const line = (stroke: string, width: number) => {
            const element = document.createElementNS(svgNamespace, "polyline");
            element.setAttribute("fill", "none");
            element.setAttribute("stroke", stroke);
            element.setAttribute("stroke-width", String(width));
            element.setAttribute("stroke-linecap", "round");
            element.setAttribute("stroke-linejoin", "round");
            return element;
          };
          const casing = line(ROUTE_MAP.casing, ROUTE_MAP.casingWidth);
          const routeLine = line(ROUTE_MAP.line, ROUTE_MAP.lineWidth);
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

        landmarks.forEach((point) => {
          const element = markerElement("div", ROUTE_MAP.landmarkSize, MAP_POINT_TONES[point.kind], LANDMARK_GLYPH[point.kind], labels.landmark(point.kind));
          element.style.zIndex = "5";
          markers.push(new maplibregl.Marker({ element, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map!));
        });

        stops.forEach((point, index) => {
          const marker = markerElement(
            "button",
            ROUTE_MAP.markerSize,
            { background: point.markerColor ?? "#1f2937", border: point.markerBorderColor ?? "#64748b", text: point.markerTextColor ?? "#ffffff" },
            point.markerText ?? String(index + 1),
            point.label ?? labels.stop(index + 1),
          );
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
              marker.title = labels.you;
              marker.setAttribute("aria-label", labels.you);
              marker.style.cssText = `width:18px;height:18px;border-radius:9999px;background:${MAP_POINT_TONES.you.background};border:3px solid ${MAP_POINT_TONES.you.border};box-shadow:0 0 0 6px rgba(37,99,235,.22),0 4px 14px rgba(15,23,42,.45);`;
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
    // labels and t only change with the language; the effect keys on what it draws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.lat, start.lng, stops, landmarkKey, encodedPolyline, showCurrentLocation, locateLabel, onStopClick, t]);

  if (unavailable) return <MapUnavailable label={alt} hint={t("mapUnavailableHint")} className={`h-64 sm:h-72 ${className ?? ""}`} />;
  return (
    <div className={`relative h-64 w-full overflow-hidden sm:h-72 ${MAP_SURFACE_CLASS} ${className ?? ""}`}>
      <div ref={containerRef} role="img" aria-label={alt} className="absolute inset-0" />
      {ready ? null : <MapSkeleton className="pointer-events-none absolute inset-0" />}
    </div>
  );
}
