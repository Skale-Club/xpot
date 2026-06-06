import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";

/* ---------- color math ---------- */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = HEX_RE.test(hex) ? hex : "#000000";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/* ---------- drag helper ---------- */

function useDrag(onMove: (xRatio: number, yRatio: number) => void) {
  const ref = useRef<HTMLDivElement>(null);

  function handle(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onMove(clamp((clientX - rect.left) / rect.width, 0, 1), clamp((clientY - rect.top) / rect.height, 0, 1));
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    handle(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => handle(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return { ref, onPointerDown };
}

/* ---------- popover ---------- */

function ColorPopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  // keep hue locally so it survives s/v = 0
  const initial = rgbToHsv(...(Object.values(hexToRgb(value)) as [number, number, number]));
  const [hsv, setHsv] = useState(initial);

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  function emit(next: { h: number; s: number; v: number }) {
    setHsv(next);
    const c = hsvToRgb(next.h, next.s, next.v);
    onChange(rgbToHex(c.r, c.g, c.b));
  }

  const sv = useDrag((x, y) => emit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => emit({ ...hsv, h: x * 360 }));

  function setRgb(part: "r" | "g" | "b", raw: string) {
    const n = clamp(parseInt(raw || "0", 10) || 0, 0, 255);
    const cur = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const next = { ...cur, [part]: n };
    emit(rgbToHsv(next.r, next.g, next.b));
  }

  async function eyedrop() {
    const Eye = (window as any).EyeDropper;
    if (!Eye) return;
    try {
      const res = await new Eye().open();
      const c = hexToRgb(res.sRGBHex);
      emit(rgbToHsv(c.r, c.g, c.b));
    } catch {
      /* cancelled */
    }
  }

  const supportsEyedropper = typeof window !== "undefined" && "EyeDropper" in window;
  const hueColor = rgbToHex(...(Object.values(hsvToRgb(hsv.h, 1, 1)) as [number, number, number]));

  return (
    <div
      className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-white/10 bg-[#0c1124] p-3 shadow-2xl shadow-black/50"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* saturation / value area */}
      <div
        ref={sv.ref}
        onPointerDown={sv.onPointerDown}
        className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-lg"
        style={{ backgroundColor: hueColor }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right,#fff,transparent)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top,#000,transparent)" }} />
        <div
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        {supportsEyedropper && (
          <button
            onClick={eyedrop}
            className="shrink-0 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Pick from screen"
          >
            <Pipette className="h-4 w-4" />
          </button>
        )}
        <span className="h-7 w-7 shrink-0 rounded-full ring-1 ring-inset ring-white/15" style={{ backgroundColor: hex }} />
        {/* hue slider */}
        <div
          ref={hue.ref}
          onPointerDown={hue.onPointerDown}
          className="relative h-3 flex-1 cursor-pointer touch-none rounded-full"
          style={{
            background:
              "linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>

      {/* RGB inputs */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["r", "g", "b"] as const).map((k) => (
          <div key={k}>
            <input
              value={Math.round(rgb[k])}
              onChange={(e) => setRgb(k, e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              maxLength={3}
              className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-2 py-1.5 text-center text-sm text-white outline-none focus:border-blue-500/50"
            />
            <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {k}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-3 w-full rounded-lg bg-blue-500 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
      >
        Done
      </button>
    </div>
  );
}

/* ---------- public field ---------- */

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const valid = HEX_RE.test(value);
  const swatch = valid ? value : "#000000";

  // close on outside click / Escape
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onHex(raw: string) {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = `#${v}`;
    v = v.replace(/[^#0-9a-fA-F]/g, "").slice(0, 7);
    onChange(v.toLowerCase());
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-white/50">{label}</label>
      <div ref={wrapRef} className="relative">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0a0f1e] p-1.5 pr-3 transition-colors focus-within:border-blue-500/50">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-white/15 transition-transform hover:scale-105"
            style={{
              background:
                "linear-gradient(45deg,#1a1f33 25%,transparent 25%),linear-gradient(-45deg,#1a1f33 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1f33 75%),linear-gradient(-45deg,transparent 75%,#1a1f33 75%)",
              backgroundSize: "10px 10px",
              backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
            }}
            title="Pick a color"
            aria-label={`${label} — pick a color`}
          >
            <span className="absolute inset-0" style={{ backgroundColor: swatch }} />
          </button>

          <div className="flex flex-1 items-center">
            <span className="select-none text-sm font-medium text-white/30">#</span>
            <input
              value={value.replace(/^#/, "")}
              onChange={(e) => onHex(e.target.value)}
              spellCheck={false}
              maxLength={6}
              placeholder="000000"
              className="w-full bg-transparent pl-0.5 font-mono text-sm uppercase tracking-wide text-white outline-none placeholder:text-white/20"
            />
          </div>

          <span
            className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-white/15"
            style={{ backgroundColor: swatch }}
            aria-hidden
          />
        </div>

        {open && <ColorPopover value={swatch} onChange={onChange} onClose={() => setOpen(false)} />}
      </div>
    </div>
  );
}
