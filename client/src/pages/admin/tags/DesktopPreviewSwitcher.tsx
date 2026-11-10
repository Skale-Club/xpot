import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { onPreviewChange, previewOn, readPreview, writePreview, type PreviewComputer } from "@/lib/xpotDesktopPreview";

// Local development only (a production build renders nothing): pick a stage of this computer, then use Make and
// Computers as a new computer would. Tool for the owner's review, so plain English.

const COMPUTER: { id: PreviewComputer; label: string }[] = [
  { id: "real", label: "Real" },
  { id: "absent", label: "No Xpot Desktop" },
  { id: "installed", label: "Installed, steps left" },
  { id: "ready", label: "Ready" },
];

export function DesktopPreviewSwitcher() {
  const qc = useQueryClient();
  const [state, setState] = useState(readPreview);
  const [open, setOpen] = useState(true);
  useEffect(() => onPreviewChange(() => {
    setState(readPreview());
    void qc.invalidateQueries({ queryKey: ["xpot-desktop"] });
  }), [qc]);
  if (!previewOn) return null;

  const row = <T extends string>(title: string, options: { id: T; label: string }[], value: T, pick: (id: T) => void) => (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{title}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => pick(option.id)}
            aria-pressed={value === option.id}
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${value === option.id ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-white" : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden w-[300px] rounded-2xl border border-fuchsia-400/30 bg-[#120d1c]/95 p-3 shadow-2xl backdrop-blur md:block" data-testid="desktop-preview-switcher">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-xs font-semibold text-fuchsia-200">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="flex-1">Stage preview (local only)</span>
        <span className="text-white/40">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {row("This computer", COMPUTER, state.computer, (computer) => writePreview({ computer }))}
          {state.computer === "installed" ? <p className="text-[11px] text-white/45">Steps done: {state.done.length} of 5. Use Install on Computers.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
