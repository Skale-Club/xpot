import { Check } from "lucide-react";

// The steps of a step-by-step dialog, the one template of the app: a rail down the side from `md` up, where each finished
// step keeps what was chosen in it, and a thin bar on a phone, which has no side to put it on.

export interface StepRailProps {
  names: readonly string[];
  /** What was chosen in each step, shown once the step is behind the person. */
  values?: ReadonlyArray<string | null | undefined>;
  current: number;
  canVisit: (index: number) => boolean;
  busy: boolean;
  onChange: (index: number) => void;
  /** "Step 2 of 5", for screen readers and the phone's bar. */
  progress: string;
}

export function StepRail({ names, values, current, canVisit, busy, onChange, progress }: StepRailProps) {
  return (
    <nav aria-label={progress} className="hidden md:block" data-testid="step-rail">
      <ol>
        {names.map((name, index) => {
          const done = index < current;
          const active = index === current;
          const value = done ? values?.[index] : null;
          return (
            <li key={name} className="relative pb-5 last:pb-0">
              {index < names.length - 1 ? <span aria-hidden="true" className={`absolute bottom-0 left-[13px] top-7 w-0.5 ${done ? "bg-violet-400/70" : "bg-white/10"}`} /> : null}
              <button
                type="button"
                disabled={busy || !canVisit(index)}
                onClick={() => onChange(index)}
                aria-current={active ? "step" : undefined}
                className="group flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-default"
                data-testid={`step-rail-${index}`}
              >
                <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors ${done ? "bg-violet-500 text-white" : active ? "bg-violet-400/15 text-white ring-2 ring-violet-400" : "bg-white/[0.06] text-white/40"}`}>
                  {done ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1 pt-1">
                  <span className={`block text-sm leading-tight ${active ? "font-semibold text-white" : done ? "font-medium text-white/80 group-hover:text-white" : "text-white/40"}`}>{name}</span>
                  {value ? <span className="mt-0.5 block truncate text-xs text-white/50" data-testid="step-rail-value">{value}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The same steps on a phone: the step's name and how far along it is. */
export function StepBar({ names, current, progress }: Pick<StepRailProps, "names" | "current" | "progress">) {
  return (
    <div className="mt-4 md:hidden" data-testid="step-bar">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-white">{names[current]}</span>
        <span className="shrink-0 text-xs text-white/50">{progress}</span>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {names.map((name, index) => <span key={name} className={`h-1.5 flex-1 rounded-full ${index <= current ? "bg-violet-400" : "bg-white/15"}`} />)}
      </div>
    </div>
  );
}
