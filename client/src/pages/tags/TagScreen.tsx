import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Building2, Contact, DollarSign, ExternalLink, Link2, Lock, Mail, Nfc, Pencil, Phone, Power, QrCode, ScanLine, Search, Smartphone, X } from "lucide-react";
import type { TagDetail } from "@shared/tagsApi";
import { TAG_DESTINATION_TYPES, type TagDestinationType } from "@shared/tags";
import { contentKindOf, contentSummary, validateChipContent, type ChipContentKind } from "@shared/chipContent";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import { buildReviewUrl } from "@shared/reviewLink";
import type { FullSalesLead } from "@/pages/xpot/types";
import { CODE_HEADING_TOPBAR, TagModelChips, TagPieceVisual, tagPlaqueSpec } from "@/components/xpot/TagProductThumbnail";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import LeadPicker, { leadPayload, type LeadChoice } from "./LeadPicker";
import TagSaleDialog from "./TagSaleDialog";
import { formatCents } from "@/pages/xpot/utils";
import { GenerateReviewButton, ReviewLinkAssist } from "./ReviewLinkSheet";
import { ContentEditor, type ContentState } from "./ContentEditor";
import WriteSheet, { manualSteps, type WriteResult } from "./WriteSheet";
import LockSheet from "./LockSheet";
import PieceDashboard from "./PieceDashboard";
import { isWebNfcSupported } from "./webNfc";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { APP_BASE, errorText, getSellTo, haptic, lookupTag, pushRecent, shortUrl, tagPath, tagsGet, tagsPost, useBanner } from "./lib";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_TERTIARY,
  Banner,
  BottomSheet,
  CARD,
  CHIP_TONE,
  CopyButton,
  EYEBROW,
  EYEBROW_MUTED,
  FieldLabel,
  INPUT,
  LinkInput,
  Pill,
  SHEET_TITLE,
  SOLD_TONE, STATUS_TONE,
  Spinner,
  TopBar,
} from "./ui";

// One piece, opened by scanning it or from the list. Top to bottom: which piece
// and whether it is live; the NFC chip (written here on Android; on an iPhone the
// link goes into NFC Tools and a tap that reads the chip confirms it); the setup /
// customer link (whose piece it is and where it opens, with its own Change
// button); then selling it. The editor stays closed on a configured piece.

type Loaded = { kind: "ok"; tag: TagDetail } | { kind: "not_found" } | { kind: "not_yours" };

async function fetchTag(code: string): Promise<Loaded> {
  const found = await lookupTag(code);
  if (!found.ok) return { kind: found.reason };
  return { kind: "ok", tag: await tagsGet<TagDetail>(`/api/xpot/tags/${found.id}`) };
}

const isDestinationType = (value: string | null): value is TagDestinationType =>
  !!value && (TAG_DESTINATION_TYPES as readonly string[]).includes(value);

const KIND_ICON = { url: Link2, email: Mail, phone: Phone, vcard: Contact } as const;

export default function TagScreen({ code, onClose }: {
  code: string;
  /** Set when shown in the desktop pane beside the pieces list. */
  onClose?: () => void;
}) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { banner, show } = useBanner();
  const queryKey = ["tags", "piece", code];
  // No Web NFC on a phone (iPhone): written with NFC Tools, confirmed by a real tap.
  const isDesktop = useIsDesktop();
  const manualFlow = !isWebNfcSupported() && !isDesktop;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchTag(code),
    staleTime: 0,
    // Written but not checked (iPhone + NFC Tools): a real tap confirms it on the server; watch for it.
    refetchInterval: (q) => {
      const status = q.state.data?.kind === "ok" ? q.state.data.tag.nfcStatus : null;
      return status === "programmed" || (manualFlow && (status === "not_programmed" || status === "failed")) ? 4000 : false;
    },
  });
  const tag = data?.kind === "ok" ? data.tag : null;
  const { data: leads } = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], staleTime: 60_000 });

  const [link, setLink] = useState("");
  // What the piece opens: a link (above) or an email, phone or contact card (ContentEditor).
  const [kind, setKind] = useState<ChipContentKind>("url");
  const [content, setContent] = useState<ContentState>({ value: null, error: null });
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [lead, setLead] = useState<LeadChoice>(null);
  // The editor is a pop-up: "Change" and "Set up this piece" open it.
  const [editing, setEditing] = useState(false);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<"save" | "toggle" | "rename" | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  // iPhone: the NFC Tools steps, shown by themselves until the chip is confirmed, then on "Rewrite".
  const [manualOpen, setManualOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seed the form once per piece.
  useEffect(() => {
    if (!tag || seeded === tag.id) return;
    setSeeded(tag.id);
    const storedKind = contentKindOf(tag.destinationUrl);
    setKind(storedKind);
    if (storedKind === "url") setLink(tag.destinationUrl ?? "");
    else setInitialContent(tag.destinationUrl);
    setLabel(tag.label ?? "");
    pushRecent({ kind: "xpot", value: tag.publicCode });
    // Selling during a visit: an unsold piece goes to the visit's customer.
    const sellTo = getSellTo();
    if (!tag.leadId && sellTo) {
      setLead({ leadId: sellTo.leadId, name: sellTo.name, placeId: sellTo.placeId });
      if (sellTo.placeId && !tag.destinationUrl) setLink(buildReviewUrl(sellTo.placeId));
      // Selling during a visit: straight to setting the piece up.
      setEditing(true);
    }
    if (new URLSearchParams(window.location.search).get("write") === "1") {
      // In the desktop pane the path is /tags/pieces/<code>; only drop the query.
      window.history.replaceState(null, "", onClose ? window.location.pathname : tagPath(tag.publicCode));
      // On an iPhone the steps are already at the top of the screen.
      if (!manualFlow) setWriteOpen(true);
    }
  }, [tag, seeded]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDetail = useCallback(
    (detail: TagDetail) => {
      const next: Loaded = { kind: "ok", tag: detail };
      qc.setQueryData(queryKey, next);
      void qc.invalidateQueries({ queryKey: ["/api/xpot/tags/summary"] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/tags/dashboard"] });
      void qc.invalidateQueries({ queryKey: ["tags", "list"] });
      // The pieces chip on each Visits lead counts these too (sold, live, scans).
      void qc.invalidateQueries({ queryKey: ["/api/xpot/tags/by-lead"] });
    },
    [qc, code], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const closeButton = onClose ? (
    <button type="button" onClick={onClose} aria-label={t("closePane")} title={t("closePane")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white">
      <X className="h-4 w-4" />
    </button>
  ) : undefined;
  const back = onClose ? undefined : APP_BASE;

  if (isLoading) {
    return (
      <>
        <TopBar title={code} back={back} right={closeButton} />
        <div className="flex justify-center py-20 text-white/40">
          <Spinner className="h-8 w-8" />
        </div>
      </>
    );
  }

  if (error || !tag) {
    const title = error ? t("loadFailed") : data?.kind === "not_yours" ? t("notYours") : t("notFound", { code });
    return (
      <>
        <TopBar title={code} back={back} right={closeButton} />
        <div className={`${CARD} p-6 text-center`}>
          <ScanLine className="mx-auto h-10 w-10 text-white/30" />
          <p className="mt-3 text-lg font-bold text-white" data-testid="text-tag-error">
            {title}
          </p>
          {error && <p className="mt-1 text-sm text-white/45">{errorText(error, tc("requestFailed"))}</p>}
          {!onClose && (
            <button type="button" onClick={() => navigate(APP_BASE)} className={`${BTN_SECONDARY} mt-5`}>
              {t("readAnother")}
            </button>
          )}
        </div>
      </>
    );
  }

  // Choosing a customer: an unsold piece, or moving this one to another customer.
  const needsLead = !tag.leadId || changingCustomer;
  // The customer's Google Place, when known, gives its review link for free.
  const ownLead = tag.leadId ? leads?.find((l) => l.id === tag.leadId) : undefined;
  const leadPlace = needsLead ? lead?.placeId ?? null : ownLead?.googlePlaceId ?? null;
  const leadPlaceName = needsLead ? lead?.name ?? "" : tag.leadName ?? "";
  const disabled = tag.status === "disabled";
  const locked = tag.nfcStatus === "locked";
  const chipMissing = tag.nfcStatus === "not_programmed" || tag.nfcStatus === "failed";
  const chipConfirmed = tag.nfcStatus === "verified";
  // An iPhone locks only a chip a tap confirmed (lock a wrong chip and it is lost).
  const canLock = !locked && (manualFlow ? chipConfirmed : !chipMissing);
  const destinationLabel = (value: string) => (isDestinationType(value) ? t(`dest_${value}`) : value);

  const save = async () => {
    const check = kind === "url"
      ? validateChipContent(normalizeUrlInput(link), { allowHttp: true })
      : content.value
        ? validateChipContent(content.value)
        : null;
    if (!check?.ok) return show({ tone: "error", text: kind === "url" ? t("invalidLink") : content.error ?? t("invalidLink") });
    if (needsLead && !lead) return show({ tone: "error", text: t("chooseCustomer") });
    setBusy("save");
    try {
      const detail = await tagsPost<TagDetail>(`/api/xpot/tags/${tag.id}/quick-activate`, {
        destinationUrl: check.value,
        // The type follows from what it opens: a Google review form, a booking page, an email…
        destinationType: kind === "url" ? guessDestinationType(check.value) : kind,
        // Empty clears the label (the server turns "" into null).
        label,
        ...(needsLead ? leadPayload(lead) : {}),
      });
      setDetail(detail);
      if (kind === "url") setLink(detail.destinationUrl ?? check.value);
      if (lead && !lead.leadId) void qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      setLead(null);
      setChangingCustomer(false);
      setEditing(false);
      haptic([40, 30, 40]);
      show({ tone: "ok", text: t("savedLive") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setBusy(null);
    }
  };

  // Another company: the old one's link must not carry over to the new one.
  const startCustomerChange = () => {
    setRenameOpen(false);
    setChangingCustomer(true);
    setLead(null);
    setKind("url");
    setLink("");
    setInitialContent(null);
    setEditing(true);
  };

  const closeEditor = () => {
    setEditing(false);
    setChangingCustomer(false);
    setLead(null);
  };

  const rename = async () => {
    const name = newName.trim();
    if (!name || !tag.leadId) return;
    setBusy("rename");
    try {
      await apiRequest("PATCH", `/api/xpot/leads/${tag.leadId}`, { name });
      await qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      setRenameOpen(false);
      show({ tone: "ok", text: t("customerRenamed") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async () => {
    setBusy("toggle");
    try {
      setDetail(await tagsPost<TagDetail>(`/api/xpot/tags/${tag.id}/${disabled ? "activate" : "disable"}`));
      show({ tone: "ok", text: disabled ? t("switchedOn") : t("switchedOff") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setBusy(null);
    }
  };

  const onWritten = async (result: WriteResult) => {
    setDetail(await tagsPost<TagDetail>(`/api/xpot/tags/${tag.id}/nfc-written`, { readbackUrl: result.readbackUrl, method: result.method }));
  };

  const dest = tag.destinationUrl;
  const destKind = contentKindOf(dest);
  const KindIcon = KIND_ICON[destKind];
  const destDisplay = !dest ? null : destKind === "url" ? shortUrl(dest) : contentSummary(dest);
  const destType = destKind === "url" ? (tag.destinationType ? destinationLabel(tag.destinationType) : null) : t(`contentKind_${destKind}`);

  return (
    <>
      <TopBar
        title={tag.publicCode}
        titleClassName={CODE_HEADING_TOPBAR}
        back={back}
        right={closeButton}
        picture={<TagPieceVisual productType={tag.productType} face={tag.face} size="md" title={t(`face_${tag.face ?? "none"}` as "face_none")} />}
        sub={
          // The piece's state, then (after a dot) what it is. The face is the picture's job.
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Pill tone={STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>
            {tag.saleId && <Pill tone={SOLD_TONE}>{t("soldBadge")}</Pill>}
            <span className="text-white/20" aria-hidden="true">·</span>
            {tagPlaqueSpec(tag.productType, tag.face, tag.batchCode).model ? (
              <TagModelChips productType={tag.productType} face={tag.face} batchCode={tag.batchCode} className="shrink-0" />
            ) : (
              <span className="text-xs text-white/45">{t(`product_${tag.productType}` as "product_custom")}</span>
            )}
            {tag.label ? <span className="truncate text-xs text-white/45">{tag.label}</span> : null}
          </div>
        }
      />
      <Banner banner={banner} />

      {/* The NFC chip first. Android writes it right here; an iPhone cannot, so it copies the
          link into NFC Tools and the chip counts as written once a tap reads it (the server
          confirms it and this screen polls for that). Locking is a small padlock: rarely needed. */}
      <section className={`${CARD} p-4`} data-testid="chip-card">
        <div className="flex items-center justify-between gap-2">
          <p className={EYEBROW_MUTED}>{t("chipTitle")}</p>
          <div className="flex items-center gap-1">
            <Pill tone={CHIP_TONE[tag.nfcStatus] ?? "amber"}>{t(`chip_${tag.nfcStatus}` as "chip_verified")}</Pill>
            {canLock && (
              <button
                type="button"
                onClick={() => setLockOpen(true)}
                aria-label={t("lockNow")}
                title={t("lockNow")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-amber-300/80 hover:bg-white/10 active:bg-white/10"
                data-testid="button-lock-chip"
              >
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {locked ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-white/60">
            <Lock className="h-4 w-4 shrink-0 text-amber-300" />
            {t("lockedHint")}
          </p>
        ) : manualFlow && (!chipConfirmed || manualOpen) ? (
          <div className="mt-3 space-y-3" data-testid="chip-manual">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className={EYEBROW_MUTED}>{t("writeUrl")}</p>
              <p className="mt-1 break-all font-mono text-sm tracking-wide text-white" data-testid="text-write-url">
                {tag.nfcUrl}
              </p>
            </div>
            <CopyButton text={tag.nfcUrl} label={t("copyLink")} large />
            <p className="flex items-center gap-2 pt-1 text-sm font-bold text-white">
              <Smartphone className="h-4 w-4" />
              {t("iphoneTitle")}
            </p>
            <ol className="space-y-2">
              {[...manualSteps(tag.nfcUrl), "iphoneConfirmTitle" as const].map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-white/75">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-300">{i + 1}</span>
                  <span className="pt-0.5">
                    {t(step)}
                    {step === "iphoneConfirmTitle" && <span className="mt-0.5 block text-xs text-white/45">{t("iphoneConfirmHint")}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {chipConfirmed ? (
              <button type="button" onClick={() => setManualOpen(false)} className={BTN_TERTIARY}>
                {tc("done")}
              </button>
            ) : (
              <p className="flex items-center gap-2 rounded-2xl border border-blue-400/25 bg-blue-500/[0.08] px-3 py-2.5 text-sm font-semibold text-blue-100" data-testid="chip-waiting-read">
                <Spinner className="h-4 w-4 text-blue-300" />
                {t("chipWaitingRead")}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (manualFlow ? setManualOpen(true) : setWriteOpen(true))}
            className={
              chipMissing
                ? `${BTN_PRIMARY} mt-3`
                : "mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] text-sm font-semibold text-white active:bg-white/10"
            }
            data-testid="button-write-chip"
          >
            <Nfc className={chipMissing ? "h-5 w-5" : "h-4 w-4 text-blue-300"} />
            {chipMissing ? t("writeChip") : t("rewriteChip")}
          </button>
        )}
      </section>

      {/* Setup / customer link: whose piece it is and where a scan or tap sends people. */}
      <section className="mt-3 rounded-[20px] border border-blue-400/25 bg-blue-500/[0.08] p-4" data-testid="destination-hero">
        <div className="flex items-center justify-between gap-2">
          <p className={EYEBROW}>{t("setupTitle")}</p>
          {dest && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-blue-300/30 px-3 text-sm font-semibold text-blue-100 active:bg-blue-500/20"
              data-testid="button-change-destination"
            >
              <Pencil className="h-4 w-4" />
              {t("changeDestination")}
            </button>
          )}
        </div>
        {tag.leadId && (
          <div className="mt-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-white/40" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80" data-testid="text-tag-lead">
              {tag.leadName}
            </p>
            <button
              type="button"
              onClick={() => {
                setNewName(tag.leadName ?? "");
                setRenameOpen(true);
              }}
              aria-label={t("renameCustomer")}
              title={t("renameCustomer")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white active:bg-white/10"
              data-testid="button-edit-customer"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={startCustomerChange}
              className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-white/60 hover:bg-white/10 active:bg-white/10"
              data-testid="button-change-customer"
            >
              <ArrowLeftRight className="h-4 w-4" />
              {t("changeCustomerShort")}
            </button>
          </div>
        )}
        {/* Set up without a customer (made before the picker was required): Change links one. */}
        {!tag.leadId && dest && (
          <p className="mt-2 flex items-center gap-2 text-sm text-white/45" data-testid="text-tag-lead">
            <Building2 className="h-4 w-4 shrink-0 text-white/30" />
            {t("noCustomer")}
          </p>
        )}
        {dest ? (
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200">
              <KindIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              {destKind === "vcard" ? (
                <p className="truncate text-lg font-bold text-white">{destDisplay}</p>
              ) : (
                <a href={dest} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-lg font-bold text-white underline-offset-2 active:underline" data-testid="link-destination">
                  <span className="truncate">{destDisplay}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-blue-300" />
                </a>
              )}
              {destType && <p className="truncate text-xs text-white/50">{destType}</p>}
            </div>
            {destKind !== "vcard" && <CopyButton text={dest} label={t("copyLink")} />}
          </div>
        ) : (
          <>
            <p className="mt-2 text-lg font-bold text-white/55">{t("notYetWritten")}</p>
            <button type="button" onClick={() => setEditing(true)} className={`${BTN_PRIMARY} mt-3`} data-testid="button-setup-piece">
              <Power className="h-5 w-5" />
              {t("configurePiece")}
            </button>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.08] pt-3 text-sm text-white/60">
          <span className="flex items-center gap-1.5">
            <QrCode className="h-4 w-4 text-blue-300" />
            <span className="font-bold tabular-nums text-white">{tag.qrInteractions}</span> {t("qrScans")}
          </span>
          <span className="flex items-center gap-1.5">
            <Nfc className="h-4 w-4 text-blue-300" />
            <span className="font-bold tabular-nums text-white">{tag.nfcInteractions}</span> {t("nfcTaps")}
          </span>
        </div>
      </section>

      {tag.saleId ? (
        <section className="mt-3 flex items-center justify-between gap-4 rounded-[20px] border border-blue-400/20 bg-blue-500/[0.08] p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/80">{t("soldBadge")}</p>
            <p className="mt-1 text-base font-bold text-white">{t("soldFor", { amount: formatCents(tag.soldPriceCents) })}</p>
          </div>
          <span className="font-mono text-xs text-white/40">#{tag.saleId}</span>
        </section>
      ) : (
        <button type="button" onClick={() => setSaleOpen(true)} className={`${BTN_PRIMARY} mt-3 bg-none !bg-emerald-500`} data-testid="button-sell-this-piece">
          <DollarSign className="h-5 w-5" /> {t("sellThisPiece")}
        </button>
      )}

      <PieceDashboard tagId={tag.id} />

      {/* The editor, as a pop-up: the customer first (when choosing one), then what the piece opens. */}
      <BottomSheet open={editing} onClose={closeEditor} title={changingCustomer ? t("changeCustomer") : dest ? t("editDestination") : t("configurePiece")}>
        <div className="space-y-4" data-testid="destination-editor">
          <div className="flex items-center justify-between gap-2">
            <h2 className={SHEET_TITLE}>{changingCustomer ? t("changeCustomer") : dest ? t("editDestination") : t("configurePiece")}</h2>
            <button type="button" onClick={closeEditor} aria-label={tc("close")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 active:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Messages (a bad link, a save error) show here too: the page banner is behind the pop-up. */}
          <Banner banner={banner} />
          {!needsLead && tag.leadName && (
            <p className="flex items-center gap-2 text-sm text-white/60">
              <Building2 className="h-4 w-4 shrink-0 text-white/40" />
              <span className="truncate">{tag.leadName}</span>
            </p>
          )}
          {needsLead && (
            <div>
              <FieldLabel>{t("customerField")}</FieldLabel>
              <LeadPicker value={lead} onChange={setLead} />
              {changingCustomer && tag.destinationUrl ? <p className="mt-1.5 text-xs text-amber-200/80">{t("linkClearedForNewCustomer")}</p> : null}
            </div>
          )}
          {/* Only where a review link makes sense: a Google review piece, or a customer already
              matched to their Google place. An Instagram piece for a shop that is not on Maps gets nothing. */}
          {(needsLead ? lead : tag.leadId) && leadPlaceName && (leadPlace || tag.face === "google_review") && (
            <GenerateReviewButton
              name={leadPlaceName}
              placeId={leadPlace}
              currentLink={link}
              onLink={(url, place) => {
                setKind("url");
                setLink(url);
                show({ tone: "ok", text: place?.name || leadPlaceName ? t("reviewReady", { name: place?.name || leadPlaceName }) : t("reviewReadyNoName") });
              }}
            />
          )}
          <ContentEditor
            kind={kind}
            onKind={setKind}
            initial={initialContent}
            onChange={setContent}
            urlField={
              <div>
                <FieldLabel>{t("linkField")}</FieldLabel>
                <LinkInput value={link} onChange={setLink} face={tag.face} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
                <ReviewLinkAssist
                  link={link}
                  onPick={(place) => {
                    setLink(place.reviewUrl);
                    show({ tone: "ok", text: place.name ? t("reviewReady", { name: place.name }) : t("reviewReadyNoName") });
                  }}
                />
              </div>
            }
          />
          <div>
            <FieldLabel>{t("labelField")}</FieldLabel>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} maxLength={120} className={INPUT} />
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null || (kind === "url" ? !link.trim() : !content.value)}
            className={BTN_PRIMARY}
            data-testid="button-save-activate"
          >
            {busy === "save" ? <Spinner /> : <Power className="h-5 w-5" />}
            {tag.status === "active" ? t("saveLink") : t("saveAndGoLive")}
          </button>
          <button type="button" onClick={closeEditor} className={BTN_TERTIARY}>
            {tc("cancel")}
          </button>
        </div>
      </BottomSheet>

      <div className="mt-4 space-y-2">
        {(tag.status === "active" || disabled) && (
          <button type="button" onClick={() => void toggle()} disabled={busy !== null} className={BTN_TERTIARY} data-testid="button-toggle">
            {busy === "toggle" ? <Spinner /> : <Power className={`h-5 w-5 ${disabled ? "text-emerald-400" : "text-red-400"}`} />}
            {disabled ? t("switchOn") : t("switchOff")}
          </button>
        )}
        {!onClose && (
          <button
            type="button"
            onClick={() => navigate(APP_BASE)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 text-sm font-semibold text-white/40 active:text-white"
          >
            <Search className="h-4 w-4" />
            {t("readAnother")}
          </button>
        )}
      </div>

      {/* Rename the customer, or move the piece to another one. */}
      <BottomSheet open={renameOpen} onClose={() => setRenameOpen(false)} title={t("renameCustomer")}>
        <h2 className={SHEET_TITLE}>{t("renameCustomer")}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <FieldLabel>{t("customerName")}</FieldLabel>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} autoCapitalize="words" className={INPUT} data-testid="input-customer-name" />
            <p className="mt-1.5 text-xs text-white/45">{t("renameHint")}</p>
          </div>
          <button type="button" onClick={() => void rename()} disabled={busy !== null || !newName.trim() || newName.trim() === tag.leadName} className={BTN_PRIMARY}>
            {busy === "rename" ? <Spinner /> : null}
            {t("saveName")}
          </button>
          <button type="button" onClick={startCustomerChange} className={BTN_TERTIARY} data-testid="button-rename-change-instead">
            {t("changeCustomer")}
          </button>
        </div>
      </BottomSheet>

      <LockSheet
        open={lockOpen}
        identity="xpot"
        onClose={() => setLockOpen(false)}
        onLocked={async () => setDetail(await tagsPost<TagDetail>(`/api/xpot/tags/${tag.id}/nfc-locked`))}
      />

      <WriteSheet
        open={writeOpen}
        url={tag.nfcUrl}
        identity="xpot"
        onClose={() => setWriteOpen(false)}
        onDone={onWritten}
        onLock={() => setLockOpen(true)}
        confirmed={tag.nfcStatus === "verified" || tag.nfcStatus === "locked"}
        continueUrl={`${window.location.origin}${tagPath(tag.publicCode)}?write=1`}
      />
      <TagSaleDialog open={saleOpen} onOpenChange={setSaleOpen} pieces={[tag]} initialTagId={tag.id} />
    </>
  );
}
