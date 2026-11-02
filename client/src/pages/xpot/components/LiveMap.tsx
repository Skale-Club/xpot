import { useEffect, useMemo, useRef, useState } from "react";
import { Navigation, MapPinned } from "lucide-react";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { GLASS } from "@/components/xpot/surface";
import { placeUrl } from "../prospectingMaps";
import { formatMeters } from "../utils";
import { MapSkeleton } from "./MapStatus";

// Live position strip for the check-in screen.
//
// The tile comes from our own /api/xpot/map, which proxies Google's Maps
// Static API — the key stays on the server. Coordinates are rounded to ~11m
// before they reach the URL so a rep standing still (GPS jitters by a few
// metres constantly) doesn't bill a new tile render every second.
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** The chips floating over the tile. */
const MAP_CHIP = { background: "rgba(9,14,26,0.75)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" } as const;

/** The "LIVE ±15 m" seal: on the tile, or alone on a small line when the tile could not load. */
function LiveBadge({ accuracy, className = "" }: { accuracy?: number; className?: string }) {
  const t = useT(checkinMessages);
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${className}`} style={MAP_CHIP}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">{t("mapLive")}</span>
      {typeof accuracy === "number" ? (
        <span className="text-[10px] font-medium tabular-nums text-white/40">±{formatMeters(accuracy)}</span>
      ) : null}
    </div>
  );
}

/**
 * The live position. Whether the tile loaded is the screen's to know (`failed`): without a tile the map is not a
 * card at all, only the seal and a link on one small line, so the screen can give the room to something else.
 */
export function LiveMap({
  lat,
  lng,
  accuracy,
  leadLat,
  leadLng,
  leadName,
  failed,
  onFailedChange,
}: {
  lat: number;
  lng: number;
  accuracy?: number;
  leadLat?: number | null;
  leadLng?: number | null;
  leadName?: string;
  failed: boolean;
  onFailedChange: (failed: boolean) => void;
}) {
  const t = useT(checkinMessages);
  const [loaded, setLoaded] = useState(false);

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
  const firstSrc = useRef(src);
  useEffect(() => {
    if (firstSrc.current === src) return;
    firstSrc.current = src;
    onFailedChange(false);
  }, [src, onFailedChange]);

  if (failed) {
    return (
      <div className="flex min-w-0 items-center gap-2" data-testid="live-location-line">
        <LiveBadge accuracy={accuracy} />
        <a href={placeUrl({ lat, lng })} target="_blank" rel="noreferrer" title={t("openInMaps")} aria-label={t("openInMaps")} className="inline-flex min-h-8 min-w-0 items-center gap-1.5 text-xs text-blue-300/85 hover:text-blue-200">
          <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden truncate sm:inline">{t("openInMaps")}</span>
        </a>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl" style={GLASS}>
      {loaded ? null : <MapSkeleton className="absolute inset-0 h-[170px]" />}
      <img
        src={src}
        alt={t("mapAlt")}
        className="relative block h-[170px] w-full object-cover"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => onFailedChange(true)}
      />

      <LiveBadge accuracy={accuracy} className="absolute left-3 top-3" />

      {/* What the second pin is, when there is one */}
      {leadName && typeof leadLat === "number" ? (
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 rounded-full px-3 py-1.5" style={MAP_CHIP}>
          <MapPinned className="h-3 w-3 shrink-0 text-blue-300" />
          <span className="truncate text-[11px] font-medium text-white/70">{leadName}</span>
        </div>
      ) : null}

      <a
        href={placeUrl({ lat, lng })}
        target="_blank"
        rel="noreferrer"
        title={t("openInMaps")}
        aria-label={t("openInMaps")}
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white"
        style={MAP_CHIP}
      >
        <Navigation className="h-4 w-4" />
      </a>
    </div>
  );
}
