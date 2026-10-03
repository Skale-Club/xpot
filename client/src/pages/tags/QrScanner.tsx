import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Zap, ZapOff } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

type TorchTrack = MediaStreamTrack & { getCapabilities?: () => unknown };

type CameraError = "qrNoCamera" | "qrDenied" | "qrFailed";

/** Full-screen rear-camera QR reader: BarcodeDetector where available, jsQR otherwise. */
export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<TorchTrack | null>(null);
  const doneRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [error, setError] = useState<CameraError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    let detector: BarcodeDetectorLike | null = null;
    try {
      detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    } catch {
      detector = null;
    }

    const finish = (text: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(40);
      onResultRef.current(text);
    };

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          if (detector) {
            const found = await detector.detect(video);
            if (found[0]?.rawValue) return finish(found[0].rawValue);
          } else {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d", { willReadFrequently: true });
            if (canvas && ctx) {
              const scale = Math.min(1, 640 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
              if (code?.data) return finish(code.data);
            }
          }
        } catch {
          // A failed frame is not fatal; try the next one.
        }
      }
      raf = window.requestAnimationFrame(() => void tick());
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("qrNoCamera");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
        trackRef.current = track ?? null;
        try {
          const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
          if (caps?.torch) setTorchAvailable(true);
        } catch {
          // no torch info
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        raf = window.requestAnimationFrame(() => void tick());
      } catch (err) {
        setError((err as { name?: string }).name === "NotAllowedError" ? "qrDenied" : "qrFailed");
      }
    })();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((v) => !v);
    } catch {
      setTorchAvailable(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black" role="dialog" aria-label={t("qrTitle")}>
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 bg-black/30" />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
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
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${torchOn ? "bg-blue-500" : "bg-black/50 active:bg-black/70"}`}
          >
            {torchOn ? <Zap className="h-6 w-6" /> : <ZapOff className="h-6 w-6" />}
          </button>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        {error ? (
          <div className="max-w-sm rounded-[20px] border border-white/10 p-5 text-center text-white" style={{ background: "#0d1424" }}>
            <p className="font-semibold">{t(error)}</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-[48px] rounded-2xl bg-blue-500 px-6 font-bold text-white active:bg-blue-600">
              {tc("back")}
            </button>
          </div>
        ) : (
          <>
            <div className="relative aspect-square w-[68vw] max-w-[320px]">
              {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"] as const).map((c) => (
                <span key={c} className={`absolute h-10 w-10 border-blue-400 ${c}`} />
              ))}
            </div>
            <p className="mt-6 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white">{t("qrAim")}</p>
          </>
        )}
      </div>
    </div>
  );
}
