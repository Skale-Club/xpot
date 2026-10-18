import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Plus, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { splitReads } from "./batches-model";

// The scan station parts shared by Receive (a batch's intake), Hand out and Take back: a camera that stays open and
// reads one QR after another, a box to type or paste codes (one or many), and the beep + buzz that tells the
// operator, eyes on the pieces, whether a read went in. Same detection as the field app's QrScanner
// (pages/tags/QrScanner.tsx): BarcodeDetector where available, jsQR otherwise.

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
type TorchTrack = MediaStreamTrack & { getCapabilities?: () => unknown };

/** The same QR held in front of the camera reads once, not once per frame. */
const SAME_READ_MS = 2500;

export type Feedback = "ok" | "warn" | "error";

let audio: AudioContext | null = null;

/** A short beep (ok: one high note; warn: two; error: one low) and a buzz on phones. Never throws. */
export function feedback(kind: Feedback) {
  try {
    navigator.vibrate?.(kind === "ok" ? 40 : kind === "warn" ? [40, 60, 40] : [120, 60, 120]);
  } catch {
    // no vibration
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume?.();
    const notes = kind === "ok" ? [880] : kind === "warn" ? [620, 620] : [220];
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = kind === "error" ? "square" : "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === "error" ? 0.25 : 0.09));
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    // no sound
  }
}

type CameraError = "qrNoCamera" | "qrDenied" | "qrFailed";

/**
 * An inline rear camera that keeps reading: every new QR in view calls `onRead`, the camera stays open in between.
 * `paused` stops reading (e.g. while a read is being sent) without closing the camera.
 */
export function ContinuousCamera({ onRead, onClose, paused = false }: { onRead: (text: string) => void; onClose: () => void; paused?: boolean }) {
  const tt = useT(tagsMessages);
  const t = useT(adminTagsFlowMessages);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<TorchTrack | null>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [flash, setFlash] = useState(false);
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

    const found = (text: string) => {
      const now = Date.now();
      const last = lastRef.current;
      if (last && last.text === text && now - last.at < SAME_READ_MS) {
        lastRef.current = { text, at: now };
        return;
      }
      lastRef.current = { text, at: now };
      setFlash(true);
      window.setTimeout(() => setFlash(false), 250);
      onReadRef.current(text);
    };

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!pausedRef.current && video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
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
              if (code?.data) found(code.data);
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

  if (error) {
    return (
      <InlineAlert tone="warning">
        <span className="flex flex-wrap items-center justify-between gap-2">
          {tt(error)}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t("cameraOff")}</Button>
        </span>
      </InlineAlert>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-black transition-colors ${flash ? "border-violet-300" : "border-white/10"}`}
      data-testid="scan-station-camera"
    >
      <video ref={videoRef} className="aspect-[4/3] max-h-[50vh] w-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      {/* The aiming square. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="aspect-square w-1/2 max-w-[220px] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="px-1 text-xs text-white/80">{paused ? t("cameraSending") : t("cameraReading")}</span>
        <span className="flex gap-1">
          {torchAvailable ? (
            <Button type="button" variant="ghost" size="icon" onClick={() => void toggleTorch()} aria-label={tt("torch")} aria-pressed={torchOn}>
              {torchOn ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} data-testid="scan-station-camera-off">
            <CameraOff className="h-4 w-4" />
            {t("cameraOff")}
          </Button>
        </span>
      </div>
    </div>
  );
}

/** The camera's on/off switch for a station. */
export function CameraButton({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  const t = useT(adminTagsFlowMessages);
  return (
    <Button type="button" variant="secondary" onClick={onToggle} disabled={disabled} aria-pressed={on} data-testid="scan-station-camera-toggle">
      {on ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
      {on ? t("cameraOff") : t("cameraOn")}
    </Button>
  );
}


/**
 * Type a code (or what a hand scanner types, ending with Enter) or paste many. Each submit hands the reads to
 * `onReads` and clears the box; it keeps the focus so the next read goes straight in.
 */
export function CodeEntry({
  onReads,
  busy = false,
  placeholder,
  submitLabel,
  testId,
  autoFocus = true,
}: {
  onReads: (reads: string[]) => void;
  busy?: boolean;
  placeholder?: string;
  submitLabel?: string;
  testId?: string;
  autoFocus?: boolean;
}) {
  const t = useT(adminTagsFlowMessages);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    // A pasted URL is one read; a list of codes is many.
    const text = value.trim();
    if (!text) return;
    const reads = /^https?:\/\//i.test(text) && !/\s/.test(text) ? [text] : splitReads(text);
    setValue("");
    onReads(reads);
    inputRef.current?.focus();
  }, [onReads, value]);
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/[\n,;]/.test(text.trim())) {
      e.preventDefault();
      onReads(splitReads(text));
    }
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 gap-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={paste}
        placeholder={placeholder ?? t("entryPlaceholder")}
        aria-label={placeholder ?? t("entryPlaceholder")}
        className="min-w-0 flex-1 font-mono"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        data-testid={testId}
      />
      <Button type="submit" variant="secondary" disabled={!value.trim()} loading={busy} className="shrink-0">
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{submitLabel ?? t("entryAdd")}</span>
      </Button>
    </form>
  );
}
