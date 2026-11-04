import { useRef, type ReactNode } from "react";

/** The stage a piece stands on, for a layout that keeps its own card around it. Must hold the picture's full size. */
export const PIECE_STAGE = "relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-white/[0.07] to-white/[0.015]";

/**
 * The card of a piece to choose, the one template wherever a piece is offered: the piece on its stage above, what it is
 * below. The whole card opens it; a 3D piece can still be turned, because a drag does not count as a click.
 */
export function PieceCard({ art, title, meta, badge, onOpen, testId }: {
  /** The picture or 3D view. It fills the stage. */
  art: ReactNode;
  title: ReactNode;
  /** One short line under the title. It never wraps. */
  meta?: ReactNode;
  /** What needs attention (a pill), in the stage's corner. */
  badge?: ReactNode;
  onOpen: () => void;
  testId?: string;
}) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (dragged.current) { dragged.current = false; return; }
          onOpen();
        }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
        onPointerDown={(event) => { down.current = { x: event.clientX, y: event.clientY }; dragged.current = false; }}
        onPointerMove={(event) => {
          if (down.current && Math.hypot(event.clientX - down.current.x, event.clientY - down.current.y) > 6) dragged.current = true;
        }}
        onPointerUp={() => { down.current = null; }}
        className="flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] text-left transition-all hover:-translate-y-0.5 hover:border-violet-400/50 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        data-testid={testId}
      >
        <span className={`${PIECE_STAGE} h-40 border-b border-white/[0.06] sm:h-44`}>
          {art}
          {badge ? <span className="pointer-events-none absolute right-2 top-2 z-10">{badge}</span> : null}
        </span>
        <span className="block min-w-0 px-3 py-2.5">
          <span className="block truncate text-sm font-semibold leading-snug text-white">{title}</span>
          {meta ? <span className="mt-0.5 block truncate text-xs text-white/50">{meta}</span> : null}
        </span>
      </div>
    </li>
  );
}
