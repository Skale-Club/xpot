import { useEffect, useRef } from "react";
import { X, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SURFACE_MODAL_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { useQrCamera } from "./useQrCamera";

/** Full-screen rear-camera QR reader (useQrCamera). */
export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const doneRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { videoRef, canvasRef, error, torchAvailable, torchOn, toggleTorch } = useQrCamera({
    onCode: (text) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(40);
      onResult(text);
    },
  });

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
            <div className="relative aspect-square w-[68vw] max-w-[320px]">
              {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"] as const).map((c) => (
                <span key={c} className={`absolute h-10 w-10 border-violet-400 ${c}`} />
              ))}
            </div>
            <p className="mt-6 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white">{t("qrAim")}</p>
          </>
        )}
      </div>
    </div>
  );
}
