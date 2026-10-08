import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, ExternalLink, Link2, Mail, Nfc, Phone, Power, QrCode, ScanLine, Search, X } from "lucide-react";
import type { TagDetail } from "@shared/tagsApi";
import { TAG_DESTINATION_TYPES, type TagDestinationType } from "@shared/tags";
import { contentKindOf, contentSummary, validateChipContent, type ChipContentKind } from "@shared/chipContent";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import { buildReviewUrl } from "@shared/reviewLink";
import type { FullSalesLead } from "@/pages/xpot/types";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import LeadPicker, { leadPayload, type LeadChoice } from "./LeadPicker";
import { GenerateReviewButton, ReviewLinkAssist } from "./ReviewLinkSheet";
import { ContentEditor, type ContentState } from "./ContentEditor";
import WriteSheet, { type WriteResult } from "./WriteSheet";
import { APP_BASE, errorText, getSellTo, haptic, lookupTag, pushRecent, shortUrl, tagPath, tagsGet, tagsPost, useBanner } from "./lib";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_TERTIARY,
  Banner,
  CARD,
  CHIP_TONE,
  CopyButton,
  EYEBROW,
  FieldLabel,
  INPUT,
  LinkInput,
  OPTION,
  Pill,
  STATUS_TONE,
  Spinner,
  TopBar,
} from "./ui";

type Loaded = { kind: "ok"; tag: TagDetail } | { kind: "not_found" } | { kind: "not_yours" };

async function fetchTag(code: string): Promise<Loaded> {
  const found = await lookupTag(code);
  if (!found.ok) return { kind: found.reason };
  return { kind: "ok", tag: await tagsGet<TagDetail>(`/api/xpot/tags/${found.id}`) };
}

const isDestinationType = (value: string | null): value is TagDestinationType =>
  !!value && (TAG_DESTINATION_TYPES as readonly string[]).includes(value);

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
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => fetchTag(code), staleTime: 0 });
  const tag = data?.kind === "ok" ? data.tag : null;
  const { data: leads } = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], staleTime: 60_000 });

  const [link, setLink] = useState("");
  // What the piece opens: a link (above) or an email, phone or contact card (ContentEditor).
  const [kind, setKind] = useState<ChipContentKind>("url");
  const [content, setContent] = useState<ContentState>({ value: null, error: null });
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [type, setType] = useState<TagDestinationType>("website");
  const [typeTouched, setTypeTouched] = useState(false);
  const [label, setLabel] = useState("");
  const [lead, setLead] = useState<LeadChoice>(null);
  const [busy, setBusy] = useState<"save" | "toggle" | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
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
    if (isDestinationType(tag.destinationType)) {
      setType(tag.destinationType);
      setTypeTouched(true);
    }
    pushRecent({ kind: "xpot", value: tag.publicCode });
    // Selling during a visit: an unsold piece goes to the visit's customer.
    const sellTo = getSellTo();
    if (!tag.leadId && sellTo) {
      setLead({ leadId: sellTo.leadId, name: sellTo.name, placeId: sellTo.placeId });
      if (sellTo.placeId && !tag.destinationUrl) {
        setLink(buildReviewUrl(sellTo.placeId));
        setType("google_review");
        setTypeTouched(true);
      }
    }
    if (new URLSearchParams(window.location.search).get("write") === "1") {
      // In the desktop pane the path is /tags/pieces/<code>; only drop the query.
      window.history.replaceState(null, "", onClose ? window.location.pathname : tagPath(tag.publicCode));
      setWriteOpen(true);
    }
  }, [tag, seeded]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLink = (value: string) => {
    setLink(value);
    if (!typeTouched) setType(guessDestinationType(value));
  };

  const setDetail = useCallback(
    (detail: TagDetail) => {
      const next: Loaded = { kind: "ok", tag: detail };
      qc.setQueryData(queryKey, next);
      void qc.invalidateQueries({ queryKey: ["/api/xpot/tags/summary"] });
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
        <TopBar title={code} back={back} right={closeButton} eyebrow={t("pieceEyebrow")} />
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
        <TopBar title={code} back={back} right={closeButton} eyebrow={t("pieceEyebrow")} />
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

  const needsLead = !tag.leadId;
  // The customer's Google Place, when known, gives its review link for free.
  const ownLead = tag.leadId ? leads?.find((l) => l.id === tag.leadId) : undefined;
  const leadPlace = needsLead ? lead?.placeId ?? null : ownLead?.googlePlaceId ?? null;
  const leadPlaceName = needsLead ? lead?.name ?? "" : tag.leadName ?? "";
  const pickLead = (choice: LeadChoice) => setLead(choice);
  const disabled = tag.status === "disabled";
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
        // A link keeps its chosen type; the other kinds are their own type.
        destinationType: kind === "url" ? type : kind,
        // Empty clears the label (the server turns "" into null).
        label,
        ...(needsLead ? leadPayload(lead) : {}),
      });
      setDetail(detail);
      if (kind === "url") setLink(detail.destinationUrl ?? check.value);
      if (lead && !lead.leadId) void qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      setLead(null);
      haptic([40, 30, 40]);
      show({ tone: "ok", text: t("savedLive") });
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

  return (
    <>
      <TopBar title={tag.leadName ?? t("noCustomer")} back={back} eyebrow={t("pieceEyebrow")} right={closeButton} />
      <Banner banner={banner} />

      {/* The piece itself, compact: which one it is and whether it is live. */}
      <section className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
        <TagFaceIcon face={tag.face} size="md" title={t(`face_${tag.face ?? "none"}` as "face_none")} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xl font-bold tracking-[0.14em] text-white" data-testid="text-tag-code">
            {tag.publicCode}
          </p>
          <p className="truncate text-xs text-white/45">
            {[t(`product_${tag.productType}` as "product_custom"), tag.face ? t(`face_${tag.face}` as "face_none") : null, tag.label].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Pill tone={STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>
      </section>

      {/* The star of the screen: where a scan or tap sends people. */}
      {(() => {
        const dest = tag.destinationUrl;
        const destKind = contentKindOf(dest);
        const KindIcon = { url: Link2, email: Mail, phone: Phone, vcard: Contact }[destKind];
        const display = !dest ? null : destKind === "url" ? shortUrl(dest) : contentSummary(dest);
        const typeLabel = destKind === "url" ? (tag.destinationType ? destinationLabel(tag.destinationType) : null) : t(`contentKind_${destKind}`);
        return (
          <section className="mt-3 rounded-[20px] border border-blue-400/25 bg-blue-500/[0.08] p-4" data-testid="destination-hero">
            <p className={EYEBROW}>{t("destination")}</p>
            {dest ? (
              <div className="mt-2 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200">
                  <KindIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {destKind === "vcard" ? (
                    <p className="truncate text-lg font-bold text-white">{display}</p>
                  ) : (
                    <a href={dest} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-lg font-bold text-white underline-offset-2 active:underline" data-testid="link-destination">
                      <span className="truncate">{display}</span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-blue-300" />
                    </a>
                  )}
                  <p className="truncate text-xs text-white/50" data-testid="text-tag-lead">
                    {[typeLabel, tag.leadName ?? t("noCustomer")].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {destKind !== "vcard" && <CopyButton text={dest} label={t("copyLink")} />}
              </div>
            ) : (
              <p className="mt-2 text-lg font-bold text-white/55" data-testid="text-tag-lead">
                {t("noDestination")}
                <span className="block text-xs font-normal text-white/40">{tag.leadName ?? t("noCustomer")}</span>
              </p>
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
              <span className="ml-auto">
                <Pill tone={CHIP_TONE[tag.nfcStatus] ?? "amber"}>{t(`chip_${tag.nfcStatus}` as "chip_verified")}</Pill>
              </span>
            </div>
          </section>
        );
      })()}

      <section className={`${CARD} mt-4 space-y-4 p-4`}>
        <h2 className="text-base font-bold text-white">{tag.destinationUrl ? t("editDestination") : t("sellTitle")}</h2>
        {needsLead && (
          <div>
            <FieldLabel>{t("customerField")}</FieldLabel>
            <LeadPicker value={lead} onChange={pickLead} />
          </div>
        )}
        {/* The customer first, then their Google review link from it. */}
        {(needsLead ? lead : tag.leadId) && leadPlaceName && (
          <GenerateReviewButton
            name={leadPlaceName}
            placeId={leadPlace}
            currentLink={link}
            onLink={(url, place) => {
              setKind("url");
              setLink(url);
              setType("google_review");
              setTypeTouched(true);
              show({ tone: "ok", text: place?.name || leadPlaceName ? t("reviewReady", { name: place?.name || leadPlaceName }) : t("reviewReadyNoName") });
            }}
          />
        )}
        <ContentEditor
          kind={kind}
          onKind={(next) => {
            setKind(next);
            // Back to a link: an email/phone type no longer fits.
            if (next === "url" && (type === "email" || type === "phone")) setType(guessDestinationType(link));
          }}
          initial={initialContent}
          onChange={setContent}
          urlField={
            <>
            <div>
              <FieldLabel>{t("linkField")}</FieldLabel>
              <LinkInput value={link} onChange={onLink} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
              <ReviewLinkAssist
                link={link}
                isReview={type === "google_review"}
                onPick={(place) => {
                  setLink(place.reviewUrl);
                  setType("google_review");
                  setTypeTouched(true);
                  show({ tone: "ok", text: place.name ? t("reviewReady", { name: place.name }) : t("reviewReadyNoName") });
                }}
              />
            </div>
            <div>
              <FieldLabel>{t("destTypeField")}</FieldLabel>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as TagDestinationType);
                  setTypeTouched(true);
                }}
                className={INPUT}
                data-testid="select-destination-type"
              >
                {/* Email and phone are kinds of their own (the buttons above), not links. */}
                {TAG_DESTINATION_TYPES.filter((value) => value !== "email" && value !== "phone").map((value) => (
                  <option key={value} value={value} className={OPTION}>
                    {destinationLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            </>
          }
        />
        <div>
          <FieldLabel>{t("labelField")}</FieldLabel>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} maxLength={120} className={INPUT} />
        </div>
        <button type="button" onClick={() => void save()} disabled={busy !== null || (kind === "url" ? !link.trim() : !content.value)} className={BTN_PRIMARY} data-testid="button-save-activate">
          {busy === "save" ? <Spinner /> : <Power className="h-5 w-5" />}
          {tag.status === "active" ? t("saveLink") : t("saveAndGoLive")}
        </button>
      </section>

      <div className="mt-4 space-y-2">
        <button type="button" onClick={() => setWriteOpen(true)} className={BTN_SECONDARY} data-testid="button-write-chip">
          <Nfc className="h-5 w-5 text-blue-600" />
          {tag.nfcStatus === "not_programmed" ? t("writeChip") : t("rewriteChip")}
        </button>
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

      <WriteSheet
        open={writeOpen}
        url={tag.nfcUrl}
        identity="xpot"
        onClose={() => setWriteOpen(false)}
        onDone={onWritten}
        continueUrl={`${window.location.origin}${tagPath(tag.publicCode)}?write=1`}
      />
    </>
  );
}
