import { Check } from "lucide-react";

/** Full labels have their own cells on desktop; phones show the active name and a segmented progress rail. */
export function ProductionSteps({ names, current, canVisit, busy, onChange, progress }: {
  names: readonly string[]; current: number; canVisit: (index: number) => boolean; busy: boolean;
  onChange: (index: number) => void; progress: string;
}) {
  return <nav aria-label={progress} className="mt-5" data-testid="production-steps">
    <div className="mb-3 flex items-center justify-between text-sm sm:hidden">
      <span className="font-medium text-white">{names[current]}</span><span className="text-xs text-white/50">{progress}</span>
    </div>
    <ol className="grid gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }}>
      {names.map((name, index) => <li key={name} className="min-w-0">
        <button type="button" disabled={busy || !canVisit(index)} onClick={() => onChange(index)} aria-label={`${index + 1}. ${name}`} aria-current={current === index ? "step" : undefined}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:px-2 ${index === current ? "bg-violet-400/10 text-white" : canVisit(index) ? "text-white/70 hover:bg-white/5" : "text-white/35"}`}>
          <span className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border font-semibold tabular-nums sm:flex ${index === current ? "border-violet-400/70 bg-violet-400/20" : "border-white/15"}`}>
            {index < current ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
          </span>
          <span className="hidden break-words leading-snug sm:block">{name}</span>
          <span aria-hidden="true" className={`h-1.5 w-full rounded-full sm:hidden ${index <= current ? "bg-violet-400" : "bg-white/15"}`} />
        </button>
      </li>)}
    </ol>
  </nav>;
}
