import { useEffect, useMemo, useState } from "react";
import { Navigation, MapPinned } from "lucide-react";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { GLASS } from "@/components/xpot/surface";
import { placeUrl } from "../prospectingMaps";
import { formatMeters } from "../utils";
import { MapSkeleton, MapUnavailable } from "./MapStatus";

// Live position strip for the check-in screen.
//
// The tile comes from our own /api/xpot/map, which proxies Google's Maps
// Static API — the key stays on the server. Coordinates are rounded to ~11m
// before they reach the URL so a rep standing still (GPS jitters by a few
// metres constantly) doesn't bill a new tile render every second.
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** The chips floating over the tile. */
const MAP_CHIP = { background: "rgba(9,14,26,0.75)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" } as const;

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
  const t = useT(checkinMessages);
  const [failed, setFailed] = useState(false);
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
  useEffect(() => setFailed(false), [src]);

  return (
    <div className="relative overflow-hidden rounded-3xl" style={GLASS}>
      {failed ? (
        <MapUnavailable label={t("mapAlt")} className="h-[170px]" />
      ) : (
        <>
          {loaded ? null : <MapSkeleton className="absolute inset-0 h-[170px]" />}
          <img
            src={src}
            alt={t("mapAlt")}
            className="relative block h-[170px] w-full object-cover"
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      )}

      {/* Live badge */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1" style={MAP_CHIP}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">{t("mapLive")}</span>
        {typeof accuracy === "number" ? (
          <span className="text-[10px] font-medium tabular-nums text-white/40">±{formatMeters(accuracy)}</span>
        ) : null}
      </div>

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
