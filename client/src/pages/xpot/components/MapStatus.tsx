import { Map as MapIcon, MapPinOff } from "lucide-react";
import { useT } from "@/i18n";
import { prospectingUiMessages } from "@/i18n/messages/prospectingUi";

// The loading and "could not load" tiles of every map (the route map, the
// check-in live map), on the app's dark card colour so nothing flashes light
// while tiles arrive.

/** The dark fill behind a map (= --card), shown before the first tile. */
export const MAP_SURFACE_CLASS = "bg-[#0b1020]";

/** A map that is still loading. Size it with `className` (same box as the map). */
export function MapSkeleton({ className = "" }: { className?: string }) {
  const t = useT(prospectingUiMessages);
  return (
    <div role="status" aria-busy="true" className={`flex w-full animate-pulse items-center justify-center ${MAP_SURFACE_CLASS} ${className}`}>
      <MapIcon className="h-8 w-8 text-white/10" aria-hidden="true" />
      <span className="sr-only">{t("mapLoading")}</span>
    </div>
  );
}

/** A map that could not load: translated, on the same dark tile. */
export function MapUnavailable({ className = "", hint, label }: { className?: string; hint?: string; label?: string }) {
  const t = useT(prospectingUiMessages);
  return (
    <div role="img" aria-label={label ?? t("mapUnavailable")} className={`flex w-full flex-col items-center justify-center gap-2 px-6 text-center ${MAP_SURFACE_CLASS} ${className}`}>
      <MapPinOff className="h-6 w-6 text-white/30" aria-hidden="true" />
      <span className="text-sm font-semibold text-white/60">{t("mapUnavailable")}</span>
      {hint ? <span className="max-w-xs text-xs leading-5 text-white/40">{hint}</span> : null}
    </div>
  );
}
