import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ClipboardPaste, Copy, Link2, Nfc, X, type LucideIcon } from "lucide-react";
import { chipNeedsWriting, formatPhoneMask, isSocialNetwork, looksLikeLink, normalizeUrlInput, SOCIAL_NETWORKS, socialHandleOf, socialNetworkOf, socialUrl, type SocialNetwork } from "@shared/tagApp";
import { stockBlock } from "@shared/tags";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/loader";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { CHIP_STATUS_TONE, PIECE_STATUS_TONE, Pill, SOLD_TONE, STOCK_STATUS_TONE } from "@/components/xpot/StatusPill";
import { ACCENT_SELECTED, EYEBROW as KIT_EYEBROW, GLASS_CLASS, MODULE_ACCENT, OVERLAY_CLASS, SURFACE_MODAL_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { cn } from "@/lib/utils";
import { formatCount, NFC_COLOR, QR_COLOR } from "./charts";
import { copyToClipboard, haptic, readClipboard, type BannerState } from "./lib";

// Class kit for the Tags screens, derived from the shared kit (docs/UI_KIT.md).
// The module's accent is violet (MODULE_ACCENT.tags): the primary action is
// <Button variant="brand" accent="tags">, and eyebrows, focus borders, "selected"
// and the tap animation are violet. A plain chip written without Xpot (the
// "direct" identity) is neutral slate. Green is only money (Sell, Record sale)
// and success; amber only "needs a step". Blue is left where it is not the
// module's colour but a meaning of its own: QR scans in the charts and counters
// (QR_COLOR, charts.ts), the kit's info alerts and the global focus outline.
// Nothing in Tags uses blue to mean "an Xpot piece" any more: every piece here
// is one, and the plain-chip screen tells itself apart by being slate.

export type Identity = "xpot" | "direct";

export const CARD = `rounded-2xl ${GLASS_CLASS}`;
/** The violet-tinted hero card (a piece's setup / customer link). */
export const CARD_ACCENT = "rounded-2xl border border-violet-400/25 bg-violet-500/[0.08]";
/** Violet focus border for the kit's Input / Textarea in Tags (`<Input className={INPUT_ACCENT} />`). */
export const INPUT_ACCENT = "focus:border-violet-400/60";
/** The kit's field (FIELD_CONTROL) with the Tags focus colour, for raw <input>s and composite fields. */
export const INPUT = cn(FIELD_CONTROL, "py-2 [color-scheme:dark]", INPUT_ACCENT);
/** One eyebrow shape (the kit's EYEBROW); EYEBROW is its module-accent variant, for a hero card or a screen's title. */
export const EYEBROW_MUTED = KIT_EYEBROW;
export const EYEBROW = KIT_EYEBROW.replace("text-white/40", MODULE_ACCENT.tags.text);
export const SHEET_TITLE = "text-xl font-bold tracking-tight text-white";
/** Icon tile of a plain chip (direct identity): neutral slate. */
export const ICON_BLOCK_DIRECT = "flex shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/60";
/** The Tags primary fill (ACCENT_GRADIENT.tags), spelled out so Tailwind sees it; the same as <Button accent="tags">. */
export const TAGS_FILL = "bg-[linear-gradient(135deg,#8b5cf6,#c026d3)] shadow-[0_8px_24px_rgba(139,92,246,0.22)]";

/** Title row for a screen: optional back arrow, eyebrow and a large title. */
export function TopBar({
  title,
  back,
  onBack,
  eyebrow,
  identity = "xpot",
  right,
  sub,
  picture,
  titleClassName = "",
}: {
  title: string;
  back?: string;
  /** Runs instead of following `back` (which stays the link's address), e.g. to go back in history. */
  onBack?: () => void;
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
          onClick={onBack ? (e) => { e.preventDefault(); onBack(); } : undefined}
          aria-label={t("back")}
          className="-ml-2 mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className={identity === "direct" ? EYEBROW_MUTED : EYEBROW}>{eyebrow}</p>}
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
      className={`flex min-h-[80px] w-full items-center gap-4 rounded-2xl p-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60 ${
        primary ? `${TAGS_FILL} text-white` : `${GLASS_CLASS} text-white`
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          primary ? "bg-white/15 text-white" : `bg-white/[0.05] ${iconClassName ?? MODULE_ACCENT.tags.text}`
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

/** The screen's message (saved, failed): the kit's InlineAlert, success or error. */
export function Banner({ banner }: { banner: BannerState }) {
  if (!banner) return null;
  return (
    <InlineAlert tone={banner.tone === "ok" ? "success" : "error"} className="mb-4 break-words font-medium">
      {banner.text}
    </InlineAlert>
  );
}

/** The app's loader (animated dots, ui/loader); sized from the h-/w- class. */
export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={className} />;
}

// Status pills: one shape and palette for admin and app (components/xpot/StatusPill.tsx).
export { Pill, type PillTone } from "@/components/xpot/StatusPill";
export { PIECE_STATUS_TONE as STATUS_TONE, CHIP_STATUS_TONE as CHIP_TONE, STOCK_STATUS_TONE as STOCK_TONE, SOLD_TONE } from "@/components/xpot/StatusPill";

/**
 * A piece's state wherever it is listed: where it is in its life, a stock problem
 * that keeps it from being set up or sold (not received, damaged, lost), and sold.
 */
export function PieceStatusPills({ tag }: { tag: { status: string; stockStatus: string; saleId: number | null } }) {
  const t = useT(tagsMessages);
  const stock = stockBlock(tag.stockStatus);
  return (
    <>
      <Pill tone={PIECE_STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>
      {stock && <Pill tone={STOCK_STATUS_TONE[stock]}>{t(`stock_${stock}`)}</Pill>}
      {tag.saleId && <Pill tone={SOLD_TONE}>{t("soldBadge")}</Pill>}
    </>
  );
}

/** The NFC chip of a listed piece: a red pill when it still needs writing, else a small coloured mark. */
export function ChipMark({ tag }: { tag: { status: string; nfcStatus: string } }) {
  const t = useT(tagsMessages);
  const label = t(`chip_${tag.nfcStatus}` as "chip_verified");
  if (chipNeedsWriting(tag)) {
    return (
      <Pill tone="red" className="gap-1">
        <Nfc className="h-3 w-3" aria-hidden="true" />
        {label}
      </Pill>
    );
  }
  const tone = CHIP_STATUS_TONE[tag.nfcStatus] ?? "slate";
  const color = tone === "green" ? "text-emerald-300/80" : tone === "amber" ? "text-amber-300/80" : tone === "red" ? "text-red-300/80" : "text-white/30";
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center ${color}`} title={label} data-chip={tag.nfcStatus}>
      <Nfc className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Copy with a check for 2 s. The kit's CopyButton look; this one keeps the
 * Tags clipboard fallback (copyToClipboard) and the haptic tap. `large` is the
 * full-width button of a sheet.
 */
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
  const Icon = copied ? Check : Copy;
  if (!large) {
    return (
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label={copied ? t("copied") : label}
        title={label}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] transition-colors hover:bg-white/10 ${copied ? "text-emerald-300" : "text-white/75 hover:text-white"}`}
      >
        <Icon className="h-5 w-5" />
      </button>
    );
  }
  return (
    <Button type="button" variant="secondary" size="lg" onClick={() => void onCopy()} className={`w-full ${copied ? "!text-emerald-300" : ""}`}>
      <Icon className="!size-5" />
      {copied ? t("copied") : label}
    </Button>
  );
}

/** Scans of a piece, the same on the phone and the desktop: the total, then QR · NFC in the charts' colours. */
export function ScanCounts({ qr, nfc, align = "right" }: { qr: number; nfc: number; align?: "left" | "right" }) {
  const t = useT(tagsMessages);
  const total = qr + nfc;
  if (total === 0) return <span className="text-white/20">—</span>;
  return (
    <span className={`block tabular-nums ${align === "right" ? "text-right" : ""}`}>
      <span className="block text-sm font-semibold text-white">{t.plural("scansCount", total, { count: formatCount(total, t.locale) })}</span>
      <span className="mt-0.5 block text-[11px] text-white/40">
        <span style={{ color: QR_COLOR }}>QR</span> {formatCount(qr, t.locale)} · <span style={{ color: NFC_COLOR }}>NFC</span> {formatCount(nfc, t.locale)}
      </span>
    </span>
  );
}

type LinkNetwork = SocialNetwork | "link";

const LINK_NETWORKS: readonly LinkNetwork[] = [...SOCIAL_NETWORKS, "link"];
/** Networks whose profile is an @handle: the field shows the @ and only the name is typed. */
const AT_HANDLE: readonly LinkNetwork[] = ["instagram", "tiktok"];
const FIELD_ICON_BTN =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white active:bg-white/10";

function NetworkMark({ network }: { network: LinkNetwork }) {
  return network === "link" ? (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <Link2 className="h-4 w-4" />
    </span>
  ) : (
    <TagFaceIcon face={network} size="xs" />
  );
}

/**
 * The link field. The network sits inside it on the left, like the country of
 * a phone field: Instagram, Facebook, TikTok or WhatsApp, and only the profile
 * (or the phone, masked) is typed; "Other link" takes any address. A piece
 * printed for a network opens on it. A whole link pasted still works and
 * switches to its network. Clear and Paste sit inside the field on the right.
 */
export function LinkInput({
  value,
  onChange,
  placeholder,
  onPasteFailed,
  face,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onPasteFailed?: () => void;
  /** What is printed on the piece: a social face preselects that network. */
  face?: string | null;
}) {
  const t = useT(commonMessages);
  const fromValue = (n: LinkNetwork, url: string) => (n === "link" ? url : socialHandleOf(n, url));
  const [network, setNetwork] = useState<LinkNetwork>(() => socialNetworkOf(value) ?? (!value && isSocialNetwork(face) ? face : "link"));
  // What the person typed: the handle, the phone's digits, or the whole link.
  const [typed, setTyped] = useState(() => fromValue(network, value));
  // The last link this field produced; anything else in `value` came from outside (a review link picked, a reset).
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const n = socialNetworkOf(value) ?? (value ? "link" : network);
    setNetwork(n);
    setTyped(fromValue(n, value));
    // Only an outside change lands here; `network` is read, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Where the network list opens: fixed to the screen, so a scrolling sheet never clips it.
  const [menuAt, setMenuAt] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const openMenu = () => {
    const r = field.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 220), 280);
    const below = window.innerHeight - r.bottom;
    setMenuAt(below >= 260 || below >= r.top ? { left: r.left, width, top: r.bottom + 6 } : { left: r.left, width, bottom: window.innerHeight - r.top + 6 });
  };
  useEffect(() => {
    if (!menuAt) return;
    const close = () => setMenuAt(null);
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !field.current?.contains(target)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    // A scroll of the page or the sheet moves the field away from the list.
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuAt]);

  const emit = (url: string) => {
    emitted.current = url;
    onChange(url);
  };
  const type = (text: string) => {
    if (network !== "link" && looksLikeLink(text.trim())) {
      // A whole link landed in the profile box: follow it to its network, or to a plain link.
      const url = normalizeUrlInput(text);
      const n = socialNetworkOf(url) ?? "link";
      setNetwork(n);
      setTyped(fromValue(n, url));
      emit(url);
      return;
    }
    const next =
      network === "whatsapp" ? text.replace(/\D/g, "").slice(0, 15)
      // The @ is already drawn in the field.
      : AT_HANDLE.includes(network) ? text.replace(/^@+/, "")
      : text;
    setTyped(next);
    emit(network === "link" ? next : socialUrl(network, next));
  };
  const pick = (n: LinkNetwork) => {
    setMenuAt(null);
    input.current?.focus();
    if (n === network) return;
    setNetwork(n);
    // A handle carries over between networks (same business, same name); a phone or a link does not.
    const carry = network !== "link" && network !== "whatsapp" && n !== "whatsapp" && n !== "link" ? typed : "";
    setTyped(carry);
    emit(n === "link" ? "" : socialUrl(n, carry));
  };
  const nameOf = (n: LinkNetwork) => (n === "link" ? t("linkOther") : NETWORK_NAMES[n]);

  const social = network !== "link";
  const shown = network === "whatsapp" ? formatPhoneMask(typed) : typed;
  const hint =
    network === "whatsapp" ? t("linkPhonePlaceholder")
    : network === "facebook" ? t("linkPagePlaceholder")
    : social ? t("linkHandlePlaceholder")
    : placeholder;
  return (
    <>
      <div ref={field} className={`${INPUT} flex min-w-0 items-center !px-1.5 !py-0 focus-within:border-violet-400/60`}>
        <button
          type="button"
          onClick={() => (menuAt ? setMenuAt(null) : openMenu())}
          aria-haspopup="listbox"
          aria-expanded={!!menuAt}
          aria-label={`${t("linkNetwork")}: ${nameOf(network)}`}
          title={nameOf(network)}
          className={`flex h-9 shrink-0 items-center gap-1 rounded-lg pl-2 pr-1.5 transition-colors hover:bg-white/[0.06] active:bg-white/10 ${menuAt ? "bg-white/[0.06] text-white" : "text-white/45"}`}
          data-testid="link-network"
        >
          <NetworkMark network={network} />
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuAt ? "rotate-180" : ""}`} />
        </button>
        <span className="mx-2 h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
        {AT_HANDLE.includes(network) ? <span className="shrink-0 select-none text-white/35">@</span> : null}
        <input
          ref={input}
          type={network === "whatsapp" ? "tel" : social ? "text" : "url"}
          inputMode={network === "whatsapp" ? "tel" : social ? "text" : "url"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={shown}
          onChange={(e) => type(e.target.value)}
          placeholder={hint}
          className="min-h-[42px] min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/30 focus:outline-none sm:text-sm"
          data-testid="input-destination"
        />
        {typed ? (
          <button type="button" onClick={() => type("")} aria-label={t("clearField")} title={t("clearField")} className={FIELD_ICON_BTN} data-testid="button-clear-destination">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            const text = await readClipboard();
            if (text) {
              type(text);
              haptic(20);
            } else onPasteFailed?.();
          }}
          aria-label={t("paste")}
          title={t("paste")}
          className={FIELD_ICON_BTN}
          data-testid="button-paste-destination"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
      </div>
      {menuAt ? (
        <div
          ref={menu}
          role="listbox"
          aria-label={t("linkNetwork")}
          className={`fixed z-[70] rounded-xl p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] ${SURFACE_MODAL_CLASS}`}
          style={{ left: menuAt.left, width: menuAt.width, top: menuAt.top, bottom: menuAt.bottom }}
        >
          {LINK_NETWORKS.map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={network === n}
              onClick={() => pick(n)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors ${
                network === n ? `${ACCENT_SELECTED.tags.row} text-white` : "text-white/75 hover:bg-white/[0.06]"
              }`}
              data-testid={`link-network-${n}`}
            >
              <NetworkMark network={n} />
              <span className="min-w-0 flex-1 truncate">{nameOf(n)}</span>
              {network === n ? <Check className={`h-4 w-4 shrink-0 ${ACCENT_SELECTED.tags.icon}`} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Brand names stay as they are in every language. */
const NETWORK_NAMES: Record<SocialNetwork, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", whatsapp: "WhatsApp" };

/** The label over a field: the kit Field's label style, for the composite controls (LinkInput, LeadPicker) that Field can't wrap. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-white/60">
      {children}
    </label>
  );
}

/** Numbered how-to steps (NFC Tools on an iPhone), numbered in the module accent. */
export function StepList({ steps, className = "" }: { steps: ReadonlyArray<{ key: string; text: ReactNode; hint?: ReactNode }>; className?: string }) {
  return (
    <ol className={`space-y-2 ${className}`}>
      {steps.map((step, i) => (
        <li key={step.key} className="flex gap-3 text-sm text-white/75">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-bold text-violet-300">{i + 1}</span>
          <span className="pt-0.5">
            {step.text}
            {step.hint ? <span className="mt-0.5 block text-xs text-white/45">{step.hint}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The buttons at the foot of a sheet or card: the primary on top, then the others, then Cancel. */
export function SheetActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-2 ${className}`}>{children}</div>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A pop-up, centered on phone and desktop. (Named for when it slid up from the bottom.)
 * The kit's modal shell: SURFACE_MODAL, OVERLAY_CLASS and the sheet radius (rounded-3xl).
 * With a `title` it draws the title row and its X; `banner` repeats the screen's
 * message inside, since the page banner sits behind the pop-up. Escape closes it,
 * focus starts inside and Tab stays inside until it closes.
 */
export function BottomSheet({ open, onClose, children, title, icon, banner }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** Shown before the title. */
  icon?: ReactNode;
  banner?: BannerState;
}) {
  const t = useT(commonMessages);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement as HTMLElement | null;
    // The first field or button, unless something inside asked for focus (autoFocus).
    const node = panel.current;
    if (node && !node.contains(document.activeElement)) {
      const first = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => el.dataset.sheetClose === undefined);
      (first ?? node).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only the top-most sheet closes, and nothing behind it (a desktop pane) does too.
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener && document.contains(opener)) opener.focus();
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
      <button type="button" tabIndex={-1} aria-label={t("close")} onClick={onClose} className={`absolute inset-0 ${OVERLAY_CLASS}`} />
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative max-h-full w-full max-w-md overflow-y-auto rounded-3xl px-5 pb-5 pt-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)] outline-none lg:max-w-lg lg:pt-6 ${SURFACE_MODAL_CLASS}`}
      >
        {title ? (
          <div className="-mr-2 -mt-1 mb-3 flex items-center justify-between gap-2">
            <h2 className={`${SHEET_TITLE} flex min-w-0 items-center gap-2`}>
              {icon}
              <span className="min-w-0 break-words">{title}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              data-sheet-close=""
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 active:bg-white/10"
              data-testid="button-sheet-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        {banner ? <Banner banner={banner} /> : null}
        {children}
      </div>
    </div>
  );
}

/** Pulsing "hold the chip to the phone" animation: violet for an Xpot piece, slate for a plain chip. */
export function TapAnimation({ identity, label, sub, icon: Icon }: { identity: Identity; label: string; sub: string; icon: LucideIcon }) {
  const color = identity === "xpot" ? "bg-violet-500" : "bg-slate-500";
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
