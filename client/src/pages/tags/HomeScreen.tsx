import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Building2, Link2, Nfc, QrCode, ScanLine, X } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import QrScanner from "./QrScanner";
import { TagsDashboard } from "./TagsDashboard";
import {
  APP_BASE,
  classify,
  clearSellTo,
  getSellTo,
  directPath,
  errorText,
  haptic,
  lookupTag,
  pushRecent,
  tagPath,
  useBanner,
} from "./lib";
import {
  ActionTile,
  BTN_DIRECT,
  BTN_TERTIARY,
  Banner,
  BottomSheet,
  CARD,
  EYEBROW_MUTED,
  INPUT,
  SHEET_TITLE,
  Spinner,
  TapAnimation,
} from "./ui";
import { isWebNfcSupported, mapNfcError, scanOnce } from "./webNfc";
import { useIsComputer, useIsDesktop } from "@/hooks/use-is-desktop";

// "read" is the chooser behind the single Read button: QR, chip or typed code.
type Sheet = { kind: "read" } | { kind: "empty" } | { kind: "nfc" } | null;

function isOwnHost(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === window.location.hostname || host === "xpot.place" || host === "www.xpot.place";
  } catch {
    return false;
  }
}

export default function HomeScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const { banner, show, clear: clearBanner } = useBanner();
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [code, setCode] = useState("");
  const [sellTo, setSellToState] = useState(getSellTo);
  const nfcAbort = useRef<AbortController | null>(null);
  const nfcSupported = isWebNfcSupported();
  // A computer has no NFC and rarely a usable camera: it types the code, or a
  // USB/Bluetooth scanner "types" the whole QR link followed by Enter.
  const isDesktop = useIsDesktop();
  // A tablet at desktop width still has a camera and maybe NFC.
  const isComputer = useIsComputer();

  const openCode = useCallback(
    async (tagCode: string) => {
      setBusy(true);
      try {
        const found = await lookupTag(tagCode);
        if (!found.ok) {
          show({ tone: "error", text: found.reason === "not_yours" ? t("notYours") : t("notFound", { code: tagCode }) });
          return;
        }
        pushRecent({ kind: "xpot", value: found.publicCode });
        navigate(tagPath(found.publicCode));
      } catch (err) {
        show({ tone: "error", text: errorText(err, tc("requestFailed")) });
      } finally {
        setBusy(false);
      }
    },
    [navigate, show, t, tc],
  );

  const handleScan = useCallback(
    async (raw: string) => {
      const result = classify(raw);
      if (result.kind === "empty") return setSheet({ kind: "empty" });
      if (result.kind === "text") return show({ tone: "error", text: t("notXpot", { text: result.text.slice(0, 80) }) });
      if (result.kind === "direct") {
        pushRecent({ kind: "direct", value: result.url });
        return navigate(directPath(result.url));
      }
      await openCode(result.code);
    },
    [navigate, openCode, show, t],
  );

  // ?code= / ?url= (shared links, home-screen shortcuts).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get("code") || params.get("url");
    if (incoming) {
      window.history.replaceState(null, "", APP_BASE);
      void handleScan(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopNfc = useCallback(() => {
    nfcAbort.current?.abort();
    nfcAbort.current = null;
  }, []);
  useEffect(() => stopNfc, [stopNfc]);

  const startNfc = async () => {
    stopNfc();
    const ctrl = new AbortController();
    nfcAbort.current = ctrl;
    setSheet({ kind: "nfc" });
    try {
      const reading = await scanOnce(ctrl.signal);
      haptic(40);
      setSheet(null);
      if (reading.kind === "url") await handleScan(reading.url);
      else if (reading.kind === "text") await handleScan(reading.text);
      else setSheet({ kind: "empty" });
    } catch (err) {
      const e = mapNfcError(err);
      if (e.silent) return;
      setSheet(null);
      show({ tone: "error", text: t(e.code) });
    }
  };

  const submitCode = () => {
    if (isDesktop) {
      const raw = code.trim();
      // Clear right away: a scanner types the next code into the same field.
      setCode("");
      const result = classify(raw);
      // A link on our own domain that is not a piece is a misread, not a direct link.
      if (result.kind === "direct" && isOwnHost(result.url)) return show({ tone: "error", text: t("invalidCode") });
      return void handleScan(raw);
    }
    const result = classify(code);
    if (result.kind !== "xpot") return show({ tone: "error", text: t("invalidCode") });
    void openCode(result.code);
  };

  const codeForm = (
    <form
      className={isComputer ? `${CARD} p-4` : ""}
      onSubmit={(e) => {
        e.preventDefault();
        submitCode();
      }}
    >
      <label htmlFor="tag-code" className={`mb-2 block ${EYEBROW_MUTED}`}>
        {isComputer ? t("typeCode") : t("orTypeCode")}
      </label>
      <div className="flex gap-2">
        <input
          id="tag-code"
          value={code}
          // Scanners send the full link; only a typed code is upper-cased.
          onChange={(e) => setCode(isDesktop && /[/:.]/.test(e.target.value) ? e.target.value : e.target.value.toUpperCase())}
          autoFocus={isComputer}
          placeholder={t("codePlaceholder")}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={isDesktop ? 2048 : 14}
          className={`${INPUT} font-mono tracking-[0.12em] placeholder:font-sans placeholder:tracking-normal`}
          data-testid="input-tag-code"
          data-shortcut="search"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 8}
          aria-label={t("open")}
          className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white disabled:opacity-40"
          data-testid="button-open-code"
        >
          {busy ? <Spinner /> : <ArrowRight className="h-5 w-5" />}
        </button>
      </div>
      {isDesktop && <p className="mt-2 text-xs text-white/35">{t("scannerHint")}</p>}
    </form>
  );

  const main = (
    <div className="space-y-5">
      {sellTo && (
        <div className="flex items-center gap-3 rounded-[20px] border border-emerald-400/25 bg-emerald-400/[0.08] p-4" data-testid="selling-to">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-white">{t("sellingTo", { name: sellTo.name })}</span>
            <span className="block text-xs text-white/50">{t("sellingToHint")}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              clearSellTo();
              setSellToState(null);
            }}
            aria-label={t("stopSelling")}
            className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 active:bg-white/10"
          >
            <X className="h-4 w-4" />
            {t("stopSelling")}
          </button>
        </div>
      )}

      {sheet?.kind !== "read" && <Banner banner={banner} />}

      {!isComputer && (
        <ActionTile
          primary
          icon={ScanLine}
          title={t("readPiece")}
          description={t("readPieceHint")}
          onClick={() => {
            // A message from an earlier read would otherwise reappear inside the chooser.
            clearBanner();
            setSheet({ kind: "read" });
          }}
          disabled={busy}
          testId="button-read-piece"
        />
      )}

      {isComputer && codeForm}

      {/* Real activity: scans over time, recent scans, top pieces and customers. */}
      <TagsDashboard />

      {qrOpen && (
        <QrScanner
          onClose={() => setQrOpen(false)}
          onResult={(text) => {
            setQrOpen(false);
            void handleScan(text);
          }}
        />
      )}

      <BottomSheet open={sheet?.kind === "read"} onClose={() => setSheet(null)} title={t("readPiece")}>
        <h2 className={SHEET_TITLE}>{t("readPiece")}</h2>
        {banner && (
          <div className="mt-3">
            <Banner banner={banner} />
          </div>
        )}
        {/* QR first: it always works, while a chip is only found once it has been written. */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setSheet(null);
              setQrOpen(true);
            }}
            disabled={busy}
            data-testid="button-scan-qr"
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="flex min-h-[164px] flex-col items-center justify-center gap-2.5 rounded-[22px] bg-gradient-to-br from-blue-500 to-indigo-500 p-3 text-center text-white shadow-[0_8px_24px_rgba(59,130,246,0.25)] transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {t("recommended")}
            </span>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
              <QrCode className="h-8 w-8" />
            </span>
            <span>
              <span className="block text-base font-bold leading-tight">{t("scanQr")}</span>
              <span className="mt-1 block text-[11px] leading-snug text-white/75">{t("scanQrHint")}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void startNfc()}
            disabled={busy || !nfcSupported}
            data-testid="button-scan-nfc"
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="flex min-h-[164px] flex-col items-center justify-center gap-2.5 rounded-[22px] border border-white/10 bg-white/[0.04] p-3 text-center text-white transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-blue-300">
              <Nfc className="h-8 w-8" />
            </span>
            <span>
              <span className="block text-base font-bold leading-tight">{t("readChip")}</span>
              <span className="mt-1 block text-[11px] leading-snug text-amber-200/80">
                {nfcSupported ? t("readChipHint") : t("readChipUnavailable")}
              </span>
            </span>
          </button>
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">{codeForm}</div>
        <button type="button" onClick={() => setSheet(null)} className={`mt-4 ${BTN_TERTIARY}`}>
          {tc("cancel")}
        </button>
      </BottomSheet>

      <BottomSheet
        open={sheet?.kind === "nfc"}
        onClose={() => {
          stopNfc();
          setSheet(null);
        }}
        title={t("readPiece")}
      >
        <TapAnimation identity="xpot" icon={Nfc} label={t("readingTitle")} sub={t("readingSub")} />
        <button
          type="button"
          onClick={() => {
            stopNfc();
            setSheet(null);
          }}
          className={BTN_TERTIARY}
        >
          {tc("cancel")}
        </button>
      </BottomSheet>

      <BottomSheet open={sheet?.kind === "empty"} onClose={() => setSheet(null)} title={t("chipEmpty")}>
        <h2 className={SHEET_TITLE}>{t("chipEmpty")}</h2>
        <div className="mt-5 space-y-3">
          <button type="button" onClick={() => navigate(directPath())} className={BTN_DIRECT}>
            <Link2 className="h-5 w-5" />
            {t("openDirect")}
          </button>
          <button type="button" onClick={() => setSheet(null)} className={BTN_TERTIARY}>
            {tc("close")}
          </button>
        </div>
      </BottomSheet>
    </div>
  );

  return main;
}
