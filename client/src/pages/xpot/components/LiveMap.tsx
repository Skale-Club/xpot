import { useEffect, useMemo, useState } from "react";
import { Navigation, MapPinned } from "lucide-react";

// Live position strip for the check-in screen.
//
// The tile comes from our own /api/xpot/map, which proxies Google's Maps
// Static API — the key stays on the server. Coordinates are rounded to ~11m
// before they reach the URL so a rep standing still (GPS jitters by a few
// metres constantly) doesn't bill a new tile render every second.
const round = (n: number) => Math.round(n * 1e4) / 1e4;

export function LiveMap({
  lat,
  lng,
  accuracy,
  leadLat,
  leadLng,
  leadName,
}: {
  lat: number;
  lng: number;
  accuracy?: number;
  leadLat?: number | null;
  leadLng?: number | null;
  leadName?: string;
}) {
  const [failed, setFailed] = useState(false);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      lat: String(round(lat)),
      lng: String(round(lng)),
      w: "400",
      h: "170",
    });
    if (typeof leadLat === "number" && typeof leadLng === "number") {
      params.set("leadLat", String(round(leadLat)));
      params.set("leadLng", String(round(leadLng)));
    }
    return `/api/xpot/map?${params.toString()}`;
  }, [lat, lng, leadLat, leadLng]);

  // A new tile URL deserves a fresh chance: the previous one may have failed
  // for a reason that no longer applies (offline, transient 502).
  useEffect(() => setFailed(false), [src]);

  if (failed) return null;

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
    >
      <img
        src={src}
        alt="Your current location"
        className="block h-[170px] w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />

      {/* Live badge */}
      <div
        className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
        style={{ background: "rgba(9,14,26,0.75)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Live</span>
        {typeof accuracy === "number" ? (
          <span className="text-[10px] font-medium text-white/40">±{accuracy}m</span>
        ) : null}
      </div>

      {/* What the second pin is, when there is one */}
      {leadName && typeof leadLat === "number" ? (
        <div
          className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{ background: "rgba(9,14,26,0.75)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <MapPinned className="h-3 w-3 shrink-0 text-indigo-300" />
          <span className="truncate text-[11px] font-medium text-white/70">{leadName}</span>
        </div>
      ) : null}

      <a
        href={`https://maps.google.com/?q=${lat},${lng}`}
        target="_blank"
        rel="noreferrer"
        title="Open in Google Maps"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white"
        style={{ background: "rgba(9,14,26,0.75)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <Navigation className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
