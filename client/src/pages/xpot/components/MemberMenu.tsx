import { useRef } from "react";
import { MoreHorizontal } from "lucide-react";

export type MemberMenuItem = { key: string; label: string; hint?: string; danger?: boolean; onSelect: () => void };

/**
 * The "⋯" of a person's row: what can be done to them, each with one sentence of what it does, so Suspend, Remove and
 * Make owner are not three equal buttons side by side (AD-14).
 */
export function MemberMenu({ items, label, testId }: { items: MemberMenuItem[]; label: string; testId?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  if (items.length === 0) return null;
  return (
    <details ref={ref} className="group relative" data-testid={testId}>
      <summary
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden"
        aria-label={label}
        title={label}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-zinc-900 shadow-xl">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (ref.current) ref.current.open = false;
              item.onSelect();
            }}
            className="block w-full px-3 py-2.5 text-left hover:bg-white/[0.06]"
            data-testid={`${testId ?? "member-menu"}-${item.key}`}
          >
            <span className={`block text-sm font-medium ${item.danger ? "text-red-300" : "text-white"}`}>{item.label}</span>
            {item.hint ? <span className="mt-0.5 block text-xs text-white/50">{item.hint}</span> : null}
          </button>
        ))}
      </div>
    </details>
  );
}
