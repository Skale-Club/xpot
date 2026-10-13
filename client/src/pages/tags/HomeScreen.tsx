import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Building2, Link2, Nfc, QrCode, X } from "lucide-react";
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

type Sheet = { kind: "empty" } | { kind: "nfc" } | null;

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
  const { banner, show } = useBanner();
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

      <Banner banner={banner} />

      <div className={`space-y-3 ${isComputer ? "hidden" : ""}`}>
        {nfcSupported && (
          <ActionTile
            primary
            icon={Nfc}
            title={t("readPiece")}
            description={t("readPieceHint")}
            onClick={() => void startNfc()}
            disabled={busy}
            testId="button-scan-nfc"
          />
        )}
        <ActionTile
          primary={!nfcSupported}
          icon={QrCode}
          title={t("scanQr")}
          description={t("scanQrHint")}
          onClick={() => setQrOpen(true)}
          disabled={busy}
          testId="button-scan-qr"
        />
      </div>

      <form
        className={`${CARD} p-4`}
        onSubmit={(e) => {
          e.preventDefault();
          submitCode();
        }}
      >
        <label htmlFor="tag-code" className={`mb-2 block ${EYEBROW_MUTED}`}>
          {t("typeCode")}
        </label>
        <div className="flex gap-2">
          <input
            id="tag-code"
            value={code}
            // Scanners send the full link; only a typed code is upper-cased.
            onChange={(e) => setCode(isDesktop && /[/:.]/.test(e.target.value) ? e.target.value : e.target.value.toUpperCase())}
            autoFocus={isDesktop}
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
