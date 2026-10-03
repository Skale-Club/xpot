import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Link2, Nfc, QrCode, ScanLine, Tag, X } from "lucide-react";
import type { TagRepSummary } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import type { XpotMeResponse } from "@/pages/xpot/types";
import QrScanner from "./QrScanner";
import { WholesaleCard } from "./WholesaleCard";
import {
  ageOf,
  APP_BASE,
  classify,
  clearRecents,
  clearSellTo,
  getSellTo,
  directPath,
  errorText,
  getRecents,
  haptic,
  isIos,
  lookupTag,
  pushRecent,
  shortUrl,
  tagPath,
  useBanner,
  type RecentItem,
} from "./lib";
import {
  ActionTile,
  BTN_DIRECT,
  BTN_TERTIARY,
  Banner,
  BottomSheet,
  CARD,
  EYEBROW_MUTED,
  ICON_BLOCK_DIRECT,
  ICON_BLOCK_XPOT,
  INPUT,
  SHEET_TITLE,
  Spinner,
  TapAnimation,
} from "./ui";
import { isWebNfcSupported, mapNfcError, scanOnce } from "./webNfc";

type Sheet = { kind: "empty" } | { kind: "nfc" } | null;

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
      <p className="text-[22px] font-extrabold leading-none tracking-tight text-white tabular-nums">{value ?? "–"}</p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">{label}</p>
    </div>
  );
}

export default function HomeScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const { banner, show } = useBanner();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const { data: summary } = useQuery<TagRepSummary>({ queryKey: ["/api/xpot/tags/summary"], staleTime: 30_000 });
  const [recents, setRecents] = useState<RecentItem[]>(getRecents);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [code, setCode] = useState("");
  const [sellTo, setSellToState] = useState(getSellTo);
  const nfcAbort = useRef<AbortController | null>(null);
  const nfcSupported = isWebNfcSupported();
  const ios = isIos();

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
    const result = classify(code);
    if (result.kind !== "xpot") return show({ tone: "error", text: t("invalidCode") });
    void openCode(result.code);
  };

  const scans = summary ? summary.scansLast30.qr + summary.scansLast30.nfc : undefined;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300/80">
          {me ? t("homeHello", { name: me.rep.displayName.split(" ")[0] }) : "Xpot"}
        </p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-white">{t("homeTitle")}</h1>
      </header>

      <div className="grid grid-cols-2 gap-2" data-testid="tags-summary">
        <Stat label={t("statInStock")} value={summary?.inStock} />
        <Stat label={t("statActive")} value={summary?.active} />
        <Stat label={t("statSold30")} value={summary?.soldLast30} />
        <Stat label={t("statScans30")} value={scans} />
      </div>

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

      <div className="space-y-3">
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
        {!nfcSupported && ios && <p className="px-1 text-sm text-white/45">{t("iphoneHint")}</p>}
        {!nfcSupported && !ios && <p className="px-1 text-sm text-white/45">{t("nfcNoBrowser")}</p>}
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
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("codePlaceholder")}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={14}
            className={`${INPUT} font-mono tracking-[0.12em] placeholder:font-sans placeholder:tracking-normal`}
            data-testid="input-tag-code"
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
      </form>

      <WholesaleCard />

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className={EYEBROW_MUTED}>{t("recent")}</h2>
          {recents.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearRecents();
                setRecents([]);
              }}
              className="min-h-[44px] px-2 text-xs font-semibold text-white/40 active:text-white"
            >
              {t("clearRecent")}
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center px-6 py-8 text-center`}>
            <ScanLine className="h-8 w-8 text-white/25" />
            <p className="mt-2 text-sm text-white/45">{t("recentEmpty")}</p>
          </div>
        ) : (
          <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
            {recents.map((item) => {
              const age = ageOf(item.at);
              return (
                <li key={`${item.kind}:${item.value}`}>
                  <button
                    type="button"
                    onClick={() => navigate(item.kind === "xpot" ? tagPath(item.value) : directPath(item.value))}
                    className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-white/10"
                  >
                    <span className={`h-9 w-9 ${item.kind === "xpot" ? ICON_BLOCK_XPOT : ICON_BLOCK_DIRECT}`}>
                      {item.kind === "xpot" ? <Tag className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-base font-semibold text-white ${item.kind === "xpot" ? "font-mono tracking-[0.12em]" : ""}`}>
                        {item.kind === "xpot" ? item.value : shortUrl(item.value)}
                      </span>
                      <span className="block text-xs text-white/40">{item.kind === "xpot" ? t("pieceEyebrow") : t("directEyebrow")}</span>
                    </span>
                    <span className="shrink-0 text-xs text-white/35">{t(age.key, { n: age.n })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
}
