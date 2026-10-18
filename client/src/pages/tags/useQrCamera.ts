import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// The rear camera reading QR codes, shared by the field app's QrScanner and the admin scan station:
// BarcodeDetector where it works, jsQR otherwise.

/** A point in the video's own pixels (videoWidth × videoHeight). */
export interface QrPoint {
  x: number;
  y: number;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; cornerPoints?: QrPoint[] }>>;
}
type BarcodeDetectorCtor = (new (opts?: { formats?: string[] }) => BarcodeDetectorLike) & {
  getSupportedFormats?: () => Promise<string[]>;
};

type TorchTrack = MediaStreamTrack & { getCapabilities?: () => unknown };

/** Keys in the tags dictionary. */
export type CameraError = "qrNoCamera" | "qrDenied" | "qrFailed";

/** jsQR runs on the main thread; a few reads a second still feel instant and leave taps responsive. */
const JSQR_INTERVAL_MS = 120;

async function makeDetector(): Promise<BarcodeDetectorLike | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    // Some browsers expose the API without a QR engine behind it (e.g. Android without Play services).
    const formats = await Detector.getSupportedFormats?.();
    if (formats && !formats.includes("qr_code")) return null;
    return new Detector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Opens the camera on mount, closes it on unmount, and calls `onCode` with every QR it reads, plus its four
 * corners (top-left, top-right, bottom-right, bottom-left) when the reader reports them.
 * `paused` skips reading without closing the camera.
 */
export function useQrCamera({ onCode, paused = false }: { onCode: (text: string, corners: QrPoint[] | null) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<TorchTrack | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [error, setError] = useState<CameraError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let timer = 0;
    let cancelled = false;
    let detector: BarcodeDetectorLike | null = null;

    const schedule = () => {
      if (cancelled) return;
      if (detector) raf = window.requestAnimationFrame(() => void tick());
      else timer = window.setTimeout(() => void tick(), JSQR_INTERVAL_MS);
    };

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!pausedRef.current && video && video.readyState >= 2 && video.videoWidth > 0) {
        if (detector) {
          try {
            const found = await detector.detect(video);
            const hit = found[0];
            if (hit?.rawValue) onCodeRef.current(hit.rawValue, hit.cornerPoints?.length === 4 ? hit.cornerPoints : null);
          } catch {
            // A detector that fails here would fail on every frame: read with jsQR from now on.
            detector = null;
          }
        } else {
          try {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d", { willReadFrequently: true });
            if (canvas && ctx) {
              const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
              if (code?.data) {
                const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = code.location;
                const corners = [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner].map((p) => ({ x: p.x / scale, y: p.y / scale }));
                onCodeRef.current(code.data, corners);
              }
            }
          } catch {
            // A failed frame is not fatal; try the next one.
          }
        }
      }
      schedule();
    };

    // iOS pauses the video when the page goes to the background; it stays black on return otherwise.
    const onVisible = () => {
      const video = videoRef.current;
      if (document.visibilityState === "visible" && video?.srcObject && video.paused) void video.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);

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
        detector = await makeDetector();
        schedule();
      } catch (err) {
        setError((err as { name?: string }).name === "NotAllowedError" ? "qrDenied" : "qrFailed");
      }
    })();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  return { videoRef, canvasRef, error, torchAvailable, torchOn, toggleTorch };
}
