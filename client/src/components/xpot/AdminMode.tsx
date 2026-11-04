import { useViewerAccess } from "@/lib/adminMode";
import { PANEL_ICON, usePanelSwitch } from "./panelSwitch";

/**
 * A workspace identity and a clear way out, only inside a management panel (Admin, Production). It names the panel the
 * person is in. On a phone, which has no sidebar, it also offers the way to their other panels (Visits included). An
 * owner has none of this: their team's screens wear Visits' chrome (`panelChrome`), the data scope is a different matter.
 */
export function AdminModeBar() {
  const { panelChrome } = useViewerAccess();
  const { panels, current, go, label } = usePanelSwitch();
  if (!panelChrome) return null;
  const Here = PANEL_ICON[current];
  const others = panels.filter((panel) => panel !== current);
  const outline = "inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-amber-400/10 lg:hidden";
  return <div className="relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/20 bg-amber-400/[0.08] px-4 py-2 text-amber-100 lg:px-8" data-testid="admin-mode-bar">
    <span className="flex items-center gap-2 text-xs font-semibold"><Here className="h-4 w-4 text-amber-300" />{label(current)}</span>
    {others.length > 0
      ? <span className="flex flex-wrap items-center gap-1">{others.map((panel) => {
        const Icon = PANEL_ICON[panel];
        return <button key={panel} type="button" onClick={() => go(panel)} aria-label={label(panel)} className={outline} data-testid={`admin-mode-panel-${panel}`}><Icon className="h-3.5 w-3.5" />{label(panel)}</button>;
      })}</span>
      : null}
  </div>;
}
