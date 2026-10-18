import { useCallback, useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { GoogleLogo } from "@/components/ui/google-logo";
import { Loader2 } from "@/components/ui/loader";
import { SURFACE_MODAL_CLASS } from "@/components/xpot/surface";

// The one Google place-suggestion dropdown (route planner cities and sectors,
// Settings › Route home address). It is portalled to <body> and placed under
// (or above) its field, so it is never clipped by a dialog or a scroll box.
//
//   <FloatingSuggestions anchorRef={inputRef} id="city-list" open={open}>
//     <SuggestionStatus loading={query.isFetching} error={query.isError} … />
//     <SuggestionOption icon={MapPin} title="Framingham" subtitle="MA, USA" onPick={…} />
//   </FloatingSuggestions>
//
// The option picks on mousedown (and keeps the field focused, so a phone
// keyboard stays up); a keyboard "click" (detail 0) picks too.

const SUGGESTIONS_GAP = 8;
const SUGGESTIONS_VIEWPORT_GAP = 8;
const SUGGESTIONS_MAX_HEIGHT = 280;

/** Marks the dropdown so a dialog can ignore clicks inside it (it is outside the dialog in the DOM). */
export const SUGGESTIONS_ATTRIBUTE = "data-prospecting-suggestions";

export function FloatingSuggestions({
  anchorRef,
  children,
  id,
  open,
}: {
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
  id: string;
  open: boolean;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - SUGGESTIONS_GAP - SUGGESTIONS_VIEWPORT_GAP;
    const spaceAbove = rect.top - SUGGESTIONS_GAP - SUGGESTIONS_VIEWPORT_GAP;
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(SUGGESTIONS_MAX_HEIGHT, Math.max(112, placeAbove ? spaceAbove : spaceBelow));
    const width = Math.min(rect.width, viewportWidth - SUGGESTIONS_VIEWPORT_GAP * 2);
    const left = Math.max(
      SUGGESTIONS_VIEWPORT_GAP,
      Math.min(rect.left, viewportWidth - width - SUGGESTIONS_VIEWPORT_GAP),
    );

    setStyle(placeAbove
      ? { bottom: viewportHeight - rect.top + SUGGESTIONS_GAP, left, maxHeight, width }
      : { left, maxHeight, top: rect.bottom + SUGGESTIONS_GAP, width });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    updatePosition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open, updatePosition]);

  if (!open || !style || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      role="listbox"
      {...{ [SUGGESTIONS_ATTRIBUTE]: "" }}
      style={style}
      className={`pointer-events-auto fixed z-[100] overflow-y-auto overscroll-contain rounded-2xl shadow-[0_18px_44px_rgba(0,0,0,0.55)] ${SURFACE_MODAL_CLASS}`}
    >
      {children}
    </div>,
    document.body,
  );
}

/** "Suggestions from Google…" while it loads, and the unavailable line when it fails. */
export function SuggestionStatus({ loading, error, loadingLabel, errorLabel }: {
  loading: boolean;
  error: boolean;
  loadingLabel: string;
  errorLabel: string;
}) {
  return (
    <>
      {loading ? <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50"><Loader2 className="h-4 w-4" />{loadingLabel}</div> : null}
      {error ? <div className="px-4 py-3 text-sm leading-5 text-white/60">{errorLabel}</div> : null}
    </>
  );
}

/** One Google suggestion: icon, name, optional second line and the Google attribution. */
export function SuggestionOption({ icon: Icon, title, subtitle, onPick }: {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  onPick: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={false}
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      onClick={(event) => {
        if (event.detail === 0) onPick();
      }}
      className="flex min-h-12 w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left transition first:border-t-0 hover:bg-white/[0.06]"
    >
      <Icon className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/90">{title}</span>
        {subtitle ? <span className="block truncate text-xs text-white/40">{subtitle}</span> : null}
      </span>
      <GoogleLogo className="h-4 w-4 shrink-0" />
    </button>
  );
}
