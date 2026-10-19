import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SURFACE_MODAL_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { useQrCamera, type QrPoint } from "./useQrCamera";

/** Where the aiming frame sits on screen: its center, side and tilt. */
interface FrameBox {
  cx: number;
  cy: number;
  size: number;
  angle: number;
}

/** How long the frame stays locked on a QR before the read goes through, so the snap is seen. */
const LOCK_HOLD_MS = 450;

const CORNERS = [
  "left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl",
  "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl",
  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
] as const;

/** A QR's corners in video pixels, as a frame on screen around it (the video fills the screen, object-cover). */
function frameAround(corners: QrPoint[], video: HTMLVideoElement): FrameBox | null {
  const { videoWidth: vw, videoHeight: vh, clientWidth: w, clientHeight: h } = video;
  if (!vw || !vh) return null;
  const k = Math.max(w / vw, h / vh);
  const pts = corners.map((p) => ({ x: p.x * k + (w - vw * k) / 2, y: p.y * k + (h - vh * k) / 2 }));
  const side = pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0) / pts.length;
  // A square looks the same every 90°: keep the tilt within ±45° so the frame never spins around.
  const raw = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
  return {
    cx: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    cy: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    size: side * 1.2 + 16,
    angle: ((((raw + 45) % 90) + 90) % 90) - 45,
  };
}

/** Full-screen rear-camera QR reader (useQrCamera). */
export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const doneRef = useRef(false);
  const holdRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const homeRef = useRef<HTMLDivElement>(null);
  // The frame rests at `home`; once a QR is seen it snaps onto it (`lock`) and follows it until the read goes through.
  const [home, setHome] = useState<FrameBox | null>(null);
  const [lock, setLock] = useState<FrameBox | null>(null);
  const { videoRef, canvasRef, error, torchAvailable, torchOn, toggleTorch } = useQrCamera({
    onCode: (text, corners) => {
      const box = corners && videoRef.current ? frameAround(corners, videoRef.current) : null;
      if (box) setLock(box);
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(40);
      holdRef.current = window.setTimeout(() => onResultRef.current(text), box ? LOCK_HOLD_MS : 0);
    },
  });
  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  useLayoutEffect(() => {
    const measure = () => {
      const r = homeRef.current?.getBoundingClientRect();
      if (r) setHome({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, size: r.width, angle: 0 });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [error]);
  const frame = lock ?? home;

  // The page behind stays still (iOS scrolls it under a fixed layer), and Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black" role="dialog" aria-label={t("qrTitle")}>
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 bg-black/30" />

      {/* Above the centered layer below: it covers the whole screen and would swallow these taps. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label={tc("close")}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
        >
          <X className="h-6 w-6" />
        </button>
        {torchAvailable && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={t("torch")}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${torchOn ? "bg-violet-500" : "bg-black/50 active:bg-black/70"}`}
          >
            {torchOn ? <Zap className="h-6 w-6" /> : <ZapOff className="h-6 w-6" />}
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6">
        {error ? (
          <div className={`pointer-events-auto max-w-sm rounded-2xl p-5 text-center text-white ${SURFACE_MODAL_CLASS}`}>
            <p className="font-semibold">{t(error)}</p>
            <Button type="button" variant="brand" accent="tags" size="lg" onClick={onClose} className="mt-4">
              {tc("back")}
            </Button>
          </div>
        ) : (
          <>
            {/* The frame's resting place; the frame itself is drawn below so it can move. */}
            <div ref={homeRef} className="aspect-square w-[68vw] max-w-[320px]" />
            <p className={`mt-6 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white transition-opacity duration-200 ${lock ? "opacity-0" : ""}`}>{t("qrAim")}</p>
          </>
        )}
      </div>

      {!error && frame && (
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 transition-[transform,width,height,filter] ease-out motion-reduce:transition-none ${lock ? "duration-150 [filter:drop-shadow(0_0_10px_rgba(167,139,250,0.9))]" : "duration-300"}`}
          style={{
            width: frame.size,
            height: frame.size,
            transform: `translate(${frame.cx - frame.size / 2}px, ${frame.cy - frame.size / 2}px) rotate(${frame.angle}deg)`,
          }}
          data-testid="qr-frame"
          data-locked={lock ? "" : undefined}
        >
          {CORNERS.map((c) => (
            <span key={c} className={`absolute h-[22%] max-h-10 w-[22%] max-w-10 transition-colors duration-200 ${lock ? "border-violet-200" : "border-violet-400"} ${c}`} />
          ))}
        </div>
      )}
    </div>
  );
}
