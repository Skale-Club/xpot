import { ShieldCheck } from "lucide-react";
import { useViewerAccess } from "@/lib/adminMode";
import { usePanelNames } from "./panelNames";
import { usePanelDoor } from "./panelDoor";

/** A workspace identity and a clear way back, only inside the panel. The way back is the arrow and the module's name. */
export function AdminModeBar() {
  const { adminMode, profile } = useViewerAccess();
  const { panelName } = usePanelNames();
  const door = usePanelDoor();
  if (!adminMode) return null;
  const Back = door?.Icon;
  return <div className="relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/20 bg-amber-400/[0.08] px-4 py-2 text-amber-100 lg:px-8" data-testid="admin-mode-bar">
    <span className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" />{panelName(profile)}</span>
    {door && Back ? <button type="button" onClick={door.go} aria-label={door.label} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-amber-400/10 lg:hidden" data-testid="admin-mode-exit"><Back className="h-3.5 w-3.5" />{door.label}</button> : null}
  </div>;
}
