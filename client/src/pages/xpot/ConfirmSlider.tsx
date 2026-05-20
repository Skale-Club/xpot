import { useEffect, useRef, useState } from "react";
import {
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Loader2 } from '@/components/ui/loader';

/**
 * Two modes:
 *
 * Check-in (onCancel = undefined):
 *   thumb starts LEFT, drag RIGHT to confirm. Fill grows blue→green.
 *
 * Check-out (onCancel provided):
 *   thumb starts RIGHT (green = active), drag LEFT to confirm check-out.
 *   Fill shrinks and turns red as thumb approaches left.
 */
export function ConfirmSlider({
  label,
  helperText,
  loading,
  disabled,
  onConfirm,
  onCancel,
}: {
  label: string;
  helperText: string;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const isCheckOut = Boolean(onCancel);
  const startValue = isCheckOut ? 100 : 0;
  const [value, setValue] = useState(startValue);
  const hasTriggeredRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartValue = useRef(startValue);

  useEffect(() => {
    if (!loading) {
      hasTriggeredRef.current = false;
      setValue(startValue);
    }
  }, [loading, startValue]);

  const THUMB = 64;
  const PADDING = 6;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || loading) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    setDragging(true);
    dragStartX.current = e.clientX;
    dragStartValue.current = value;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current || disabled || loading) return;
    const trackWidth = (trackRef.current?.getBoundingClientRect().width ?? 300) - THUMB - PADDING * 2;
    const dx = e.clientX - dragStartX.current;
    const delta = (dx / trackWidth) * 100;
    const next = Math.min(100, Math.max(0, dragStartValue.current + delta));
    setValue(next);

    if (!isCheckOut && next >= 80 && !hasTriggeredRef.current) {
      isDragging.current = false;
      setDragging(false);
      setValue(100);
      hasTriggeredRef.current = true;
      onConfirm();
    }
    if (isCheckOut && next <= 20 && !hasTriggeredRef.current) {
      isDragging.current = false;
      setDragging(false);
      setValue(0);
      hasTriggeredRef.current = true;
      onConfirm();
    }
  }

  function onPointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    setDragging(false);
    if (!hasTriggeredRef.current) {
      setValue(startValue);
    }
  }

  function getThumbColor(v: number): string {
    if (!isCheckOut) {
      if (v <= 60) return "#6366f1"; // Indigo-500
      const t = (v - 60) / 40;
      // Interpolate from Indigo (99, 102, 241) to Emerald (16, 185, 129)
      const r = Math.round(99 + t * (16 - 99));
      const g = Math.round(102 + t * (185 - 102));
      const b = Math.round(241 + t * (129 - 241));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const t = v / 100;
      // Interpolate from Emerald (16, 185, 129) to Rose (225, 29, 72)
      const r = Math.round(225 + t * (16 - 225));
      const g2 = Math.round(29 + t * (185 - 29));
      const b = Math.round(72 + t * (129 - 72));
      return `rgb(${r}, ${g2}, ${b})`;
    }
  }

  const thumbColor = getThumbColor(value);
  const isSnapping = !dragging;

  // Label fades out as the thumb progresses
  const progress = isCheckOut ? (1 - value / 100) : (value / 100);
  const labelOpacity = Math.max(0, 1 - progress * 2.5);

  return (
    <div className="space-y-3">
      <div
        ref={trackRef}
        className={cn(
          "relative select-none touch-none rounded-full overflow-hidden backdrop-blur-md",
          dragging ? "cursor-grabbing" : "cursor-grab",
          (disabled || loading) && "opacity-40 cursor-not-allowed",
        )}
        style={{
          border: disabled ? "1px solid rgba(255,255,255,0.05)" : `1px solid ${thumbColor}40`,
          height: THUMB + PADDING * 2,
          background: disabled ? "rgba(255,255,255,0.02)" : `color-mix(in srgb, ${thumbColor} 8%, rgba(255,255,255,0.03))`,
          boxShadow: disabled ? "none" : `inset 0 4px 20px ${thumbColor}1A`,
          transition: isSnapping ? "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease" : "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >

        {/* label */}
        <div
          className="absolute inset-0 flex items-center justify-center text-center text-[13px] font-black tracking-[0.25em] pointer-events-none drop-shadow-md leading-none"
          style={{
            color: disabled ? "rgba(255,255,255,0.2)" : thumbColor,
            paddingLeft: isCheckOut ? 16 : THUMB + PADDING * 2 + 8,
            paddingRight: isCheckOut ? THUMB + PADDING * 2 + 8 : 16,
            opacity: labelOpacity,
            transition: "opacity 0.1s, color 0.3s",
          }}
        >
          {loading ? "PROCESSING..." : label}
        </div>

        {/* thumb */}
        <div
          className="absolute flex items-center justify-center rounded-full text-white pointer-events-none top-1/2 -translate-y-1/2"
          style={{
            width: THUMB,
            height: THUMB,
            left: `calc(${PADDING}px + ${value / 100} * (100% - ${THUMB}px - ${PADDING * 2}px))`,
            background: disabled ? "rgba(255,255,255,0.05)" : thumbColor,
            boxShadow: disabled ? "none" : `0 4px 16px ${thumbColor}66, inset 0 2px 4px rgba(255,255,255,0.3)`,
            transition: isSnapping ? "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s ease, box-shadow 0.3s ease" : "none",
            border: disabled ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${thumbColor}`,
          }}
        >
          {loading
            ? <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            : disabled
               ? <ChevronsRight className="h-6 w-6 text-white/30" />
               : isCheckOut
                 ? <ChevronsLeft className="h-6 w-6 text-white" />
                 : <ChevronsRight className="h-6 w-6 text-white" />
          }
        </div>
      </div>
      <div className="text-center text-xs text-white/30 tracking-wide">{helperText}</div>
    </div>
  );
}
