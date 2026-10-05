import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Nfc, Power, QrCode, ScanLine, Search, Star, X } from "lucide-react";
import type { TagDetail } from "@shared/tagsApi";
import { TAG_DESTINATION_TYPES, validateDestinationUrl, type TagDestinationType } from "@shared/tags";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import { buildReviewUrl } from "@shared/reviewLink";
import type { FullSalesLead } from "@/pages/xpot/types";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import LeadPicker, { leadPayload, type LeadChoice } from "./LeadPicker";
import { ReviewLinkAssist } from "./ReviewLinkSheet";
import WriteSheet, { type WriteResult } from "./WriteSheet";
import { APP_BASE, errorText, getSellTo, haptic, lookupTag, pushRecent, shortUrl, tagPath, tagsGet, tagsPost, useBanner } from "./lib";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_TERTIARY,
  Banner,
  CARD,
  CHIP_TONE,
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
    setLink(tag.destinationUrl ?? "");
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
  const leadReviewUrl = leadPlace ? buildReviewUrl(leadPlace) : null;
  const useLeadReview = () => {
    if (!leadReviewUrl) return;
    setLink(leadReviewUrl);
    setType("google_review");
    setTypeTouched(true);
    show({ tone: "ok", text: t("reviewFromLeadDone", { name: leadPlaceName }) });
  };
  const pickLead = (choice: LeadChoice) => {
    setLead(choice);
    // An empty link fills itself with the customer's review link.
    if (choice?.placeId && !link.trim()) {
      setLink(buildReviewUrl(choice.placeId));
      setType("google_review");
      setTypeTouched(true);
    }
  };
  const disabled = tag.status === "disabled";
  const destinationLabel = (value: string) => (isDestinationType(value) ? t(`dest_${value}`) : value);

  const save = async () => {
    const check = validateDestinationUrl(normalizeUrlInput(link), { allowHttp: true });
    if (!check.ok) return show({ tone: "error", text: t("invalidLink") });
    if (needsLead && !lead) return show({ tone: "error", text: t("chooseCustomer") });
    setBusy("save");
    try {
      const detail = await tagsPost<TagDetail>(`/api/xpot/tags/${tag.id}/quick-activate`, {
        destinationUrl: check.url,
        destinationType: type,
        // Empty clears the label (the server turns "" into null).
        label,
        ...(needsLead ? leadPayload(lead) : {}),
      });
      setDetail(detail);
      setLink(detail.destinationUrl ?? check.url);
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

      <section className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/30 blur-[30px]" />
        <div className="relative flex items-center gap-3">
          <TagFaceIcon face={tag.face} size="lg" title={t(`face_${tag.face ?? "none"}` as "face_none")} />
          <p className="font-mono text-[34px] font-bold tracking-[0.18em] text-white" data-testid="text-tag-code">
            {tag.publicCode}
          </p>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2">
          <Pill tone={STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>
          <Pill tone={CHIP_TONE[tag.nfcStatus] ?? "amber"}>{t(`chip_${tag.nfcStatus}` as "chip_verified")}</Pill>
          <Pill tone="slate">{t(`product_${tag.productType}` as "product_custom")}</Pill>
          {tag.face && <Pill tone="slate">{t(`face_${tag.face}` as "face_none")}</Pill>}
        </div>
        <dl className="relative mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">{t("customer")}</dt>
            <dd className="truncate font-semibold text-white" data-testid="text-tag-lead">
              {tag.leadName ?? t("noCustomer")}
            </dd>
          </div>
          {tag.label && (
            <div className="flex justify-between gap-4">
              <dt className="text-white/45">{t("label")}</dt>
              <dd className="truncate font-semibold text-white">{tag.label}</dd>
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <dt className="text-white/45">{t("destination")}</dt>
            <dd className="min-w-0 text-right font-semibold text-white">
              {tag.destinationUrl ? (
                <a
                  href={tag.destinationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 text-blue-300 underline-offset-2 active:underline"
                >
                  <span className="truncate">{shortUrl(tag.destinationUrl)}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ) : (
                t("noDestination")
              )}
            </dd>
          </div>
        </dl>
        <div className="relative mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] py-2">
            <QrCode className="mx-auto h-4 w-4 text-blue-300" />
            <p className="text-xl font-extrabold text-white tabular-nums">{tag.qrInteractions}</p>
            <p className="text-xs text-white/40">{t("qrScans")}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] py-2">
            <Nfc className="mx-auto h-4 w-4 text-blue-300" />
            <p className="text-xl font-extrabold text-white tabular-nums">{tag.nfcInteractions}</p>
            <p className="text-xs text-white/40">{t("nfcTaps")}</p>
          </div>
        </div>
      </section>

      <section className={`${CARD} mt-4 space-y-4 p-4`}>
        <h2 className="text-base font-bold text-white">{t("sellTitle")}</h2>
        {needsLead && (
          <div>
            <FieldLabel>{t("customerField")}</FieldLabel>
            <LeadPicker value={lead} onChange={pickLead} />
          </div>
        )}
        <div>
          <FieldLabel>{t("linkField")}</FieldLabel>
          <LinkInput value={link} onChange={onLink} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
          {leadReviewUrl && normalizeUrlInput(link) !== leadReviewUrl && (
            <button
              type="button"
              onClick={useLeadReview}
              className="mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3 text-left text-sm font-semibold text-amber-100 active:bg-amber-400/20"
              data-testid="button-lead-review"
            >
              <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
              <span className="min-w-0 truncate">{t("reviewFromLead", { name: leadPlaceName })}</span>
            </button>
          )}
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
            {TAG_DESTINATION_TYPES.map((value) => (
              <option key={value} value={value} className={OPTION}>
                {destinationLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>{t("labelField")}</FieldLabel>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} maxLength={120} className={INPUT} />
        </div>
        <button type="button" onClick={() => void save()} disabled={busy !== null || !link.trim()} className={BTN_PRIMARY} data-testid="button-save-activate">
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
