import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, ArrowRight, Check, ClipboardPaste, Copy, Loader2, X, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { copyToClipboard, haptic, readClipboard, type BannerState } from "./lib";

// Class kit for the Tags screens, in Xpot's dark glass style. Blue/indigo is an
// Xpot piece; emerald is a chip holding the customer's own link.

export type Identity = "xpot" | "direct";

export const CARD = "rounded-[20px] border border-white/10 bg-white/[0.04]";
export const INPUT =
  "w-full min-h-[48px] rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-base text-white placeholder:text-white/30 [color-scheme:dark] focus:border-blue-400/60 focus:outline-none";
export const OPTION = "bg-[#0d1424] text-white";
export const BTN_PRIMARY =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 px-6 text-base font-bold text-white shadow-[0_8px_24px_rgba(59,130,246,0.25)] transition-transform active:scale-[0.98] disabled:opacity-50";
export const BTN_SECONDARY =
  "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-base font-semibold text-slate-900 transition-transform active:scale-[0.98] disabled:opacity-50";
export const BTN_TERTIARY =
  "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 text-base font-semibold text-white/85 transition-colors active:bg-white/10 disabled:opacity-50";
export const BTN_DIRECT =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 text-base font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50";
export const EYEBROW = "text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300/80";
export const EYEBROW_MUTED = "text-[10px] font-semibold uppercase tracking-widest text-white/40";
export const SHEET_TITLE = "text-xl font-bold tracking-tight text-white";
export const ICON_BLOCK_XPOT = "flex shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300";
export const ICON_BLOCK_DIRECT = "flex shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300";

/** Title row for a screen: optional back arrow, eyebrow and a large title. */
export function TopBar({
  title,
  back,
  eyebrow,
  identity = "xpot",
  right,
  sub,
  picture,
  titleClassName = "",
}: {
  title: string;
  back?: string;
  eyebrow?: string;
  identity?: Identity;
  right?: ReactNode;
  /** A line under the title (status, details). */
  sub?: ReactNode;
  /** A picture right of the title, e.g. the piece's icon and plaque. */
  picture?: ReactNode;
  titleClassName?: string;
}) {
  const t = useT(commonMessages);
  // Back, title and the right-hand slot share one row: a row of its own for the
  // back arrow left a tall empty band above every screen.
  return (
    <header className="mb-4 flex items-start gap-2">
      {back && (
        <Link
          href={back}
          aria-label={t("back")}
          className="-ml-2 mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className={identity === "direct" ? EYEBROW.replace("text-indigo-300/80", "text-emerald-300/80") : EYEBROW}>{eyebrow}</p>}
        <h1 className={`mt-0.5 break-words text-[26px] font-extrabold leading-tight tracking-tight text-white ${titleClassName}`}>{title}</h1>
        {sub && <div className="mt-1.5">{sub}</div>}
      </div>
      {/* Top-aligned with the title: the piece's picture, not a floating badge. */}
      {picture && <div className="mt-1 shrink-0 self-start">{picture}</div>}
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

/** Big home action: icon, title, one line, arrow. */
export function ActionTile({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  primary,
  iconClassName,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  iconClassName?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{ WebkitTapHighlightColor: "transparent" }}
      className={`flex min-h-[80px] w-full items-center gap-4 rounded-[20px] p-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60 ${
        primary
          ? "bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_8px_24px_rgba(59,130,246,0.25)]"
          : "border border-white/10 bg-white/[0.04] text-white"
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
          primary ? "bg-white/15 text-white" : `bg-white/[0.05] ${iconClassName ?? "text-blue-300"}`
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold tracking-tight">{title}</span>
        <span className={`block text-sm ${primary ? "text-white/80" : "text-white/45"}`}>{description}</span>
      </span>
      <ArrowRight className={`h-5 w-5 shrink-0 ${primary ? "text-white" : "text-white/30"}`} />
    </button>
  );
}

export function Banner({ banner }: { banner: BannerState }) {
  if (!banner) return null;
  const ok = banner.tone === "ok";
  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${
        ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-red-400/30 bg-red-400/10 text-red-100"
      }`}
    >
      {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="min-w-0 break-words">{banner.text}</span>
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

// Status pills: one shape and palette for admin and app (components/xpot/StatusPill.tsx).
export { Pill, type PillTone } from "@/components/xpot/StatusPill";
export { PIECE_STATUS_TONE as STATUS_TONE, CHIP_STATUS_TONE as CHIP_TONE, SOLD_TONE } from "@/components/xpot/StatusPill";

export function CopyButton({ text, label, large = false }: { text: string; label: string; large?: boolean }) {
  const t = useT(commonMessages);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onCopy = async () => {
    if (!(await copyToClipboard(text))) return;
    haptic(30);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };
  if (!large) {
    return (
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label={label}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/80 active:bg-white/10"
      >
        {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition-colors ${
        copied ? "bg-emerald-500" : "border border-white/10 bg-white/[0.06] active:bg-white/10"
      }`}
    >
      {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
      {copied ? t("copied") : label}
    </button>
  );
}

/** URL input with Clear (inside the field) and a Paste button that reads the clipboard. */
export function LinkInput({
  value,
  onChange,
  placeholder,
  onPasteFailed,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onPasteFailed?: () => void;
}) {
  const t = useT(commonMessages);
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <input
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT} ${value ? "pr-11" : ""}`}
          data-testid="input-destination"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("clearField")}
            title={t("clearField")}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white active:bg-white/10"
            data-testid="button-clear-destination"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={async () => {
          const text = await readClipboard();
          if (text) {
            onChange(text);
            haptic(20);
          } else onPasteFailed?.();
        }}
        className="flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 px-3.5 text-sm font-semibold text-white/80 active:bg-white/10"
      >
        <ClipboardPaste className="h-4 w-4" />
        {t("paste")}
      </button>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={`mb-1.5 block ${EYEBROW_MUTED}`}>{children}</span>;
}

/** Slide-up sheet with a dimmed backdrop; a centred dialog from `lg` up. */
/** A pop-up, centered on phone and desktop. (Named for when it slid up from the bottom.) */
export function BottomSheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  const t = useT(commonMessages);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    // Centered on every screen (the owner found bottom sheets awkward on the phone).
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 lg:p-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" aria-label={t("close")} onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative max-h-full w-full max-w-md overflow-y-auto rounded-[28px] border border-white/10 px-5 pb-5 pt-5 lg:max-w-lg lg:pt-6" style={{ background: "#0d1424" }}>
        {children}
      </div>
    </div>
  );
}

/** Pulsing "hold the chip to the phone" animation. */
export function TapAnimation({ identity, label, sub, icon: Icon }: { identity: Identity; label: string; sub: string; icon: LucideIcon }) {
  const color = identity === "xpot" ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="relative flex h-36 w-36 items-center justify-center">
        <span className={`absolute inset-0 animate-ping rounded-full opacity-20 ${color}`} />
        <span className={`absolute inset-4 animate-pulse rounded-full opacity-30 ${color}`} />
        <span className={`relative flex h-20 w-20 items-center justify-center rounded-full text-white ${color}`}>
          <Icon className="h-10 w-10" />
        </span>
      </div>
      <p className={`mt-4 ${SHEET_TITLE}`}>{label}</p>
      <p className="mt-1 text-sm text-white/50">{sub}</p>
    </div>
  );
}
