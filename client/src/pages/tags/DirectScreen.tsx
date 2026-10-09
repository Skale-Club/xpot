import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, Info, Link2, Mail, Nfc, Phone, QrCode } from "lucide-react";
import { contentKindOf, contentSummary, validateChipContent, type ChipContentKind } from "@shared/chipContent";
import { normalizeUrlInput } from "@shared/tagApp";
import type { DirectWriteItem } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import LeadPicker, { leadPayload, type LeadChoice } from "./LeadPicker";
import { GenerateReviewButton, ReviewLinkAssist } from "./ReviewLinkSheet";
import { ContentEditor, type ContentState } from "./ContentEditor";
import { ContentQr } from "./ContentQr";
import LockSheet from "./LockSheet";
import WriteSheet, { type WriteResult } from "./WriteSheet";
import { ageOf, pushRecent, shortUrl, tagsGet, tagsPost, useBanner, directPath } from "./lib";
import { BTN_DIRECT, Banner, CARD, CopyButton, EYEBROW_MUTED, FieldLabel, ICON_BLOCK_DIRECT, INPUT, LinkInput, Pill, TopBar } from "./ui";

const WRITES_KEY = ["/api/xpot/tag-direct-writes"];

/** A chip that holds the customer's own link instead of an Xpot code. */
export default function DirectScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const qc = useQueryClient();
  const { banner, show } = useBanner();
  const [current, setCurrent] = useState<string | null>(null);
  const [link, setLink] = useState("");
  // A link (above) or an email, phone or contact card written straight on the chip.
  const [kind, setKind] = useState<ChipContentKind>("url");
  const [content, setContent] = useState<ContentState>({ value: null, error: null });
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [lead, setLead] = useState<LeadChoice>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [target, setTarget] = useState("");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("url");
    if (param) {
      setCurrent(param);
      reuse(param);
      pushRecent({ kind: "direct", value: param });
    }
  }, []);

  const { data: writes } = useQuery({
    queryKey: WRITES_KEY,
    queryFn: () => tagsGet<DirectWriteItem[]>("/api/xpot/tag-direct-writes"),
    staleTime: 15_000,
  });

  /** Opens a stored value (the chip just read, a recent write) in the right kind. */
  function reuse(value: string) {
    const k = contentKindOf(value);
    setKind(k);
    if (k === "url") setLink(value);
    else setInitialContent(value);
  }

  /** The validated value to write, or null after telling the user what is wrong. */
  const checked = (): string | null => {
    const check = kind === "url"
      ? validateChipContent(normalizeUrlInput(link), { allowHttp: true })
      : content.value
        ? validateChipContent(content.value)
        : null;
    if (check?.ok) return check.value;
    show({ tone: "error", text: kind === "url" ? t("invalidLink") : content.error ?? t("invalidLink") });
    return null;
  };

  const prepare = () => {
    const value = checked();
    if (!value) return;
    setTarget(value);
    setWriteOpen(true);
  };

  const openQr = () => {
    const value = checked();
    if (!value) return;
    setTarget(value);
    setQrOpen(true);
  };
  const ready = kind === "url" ? !!link.trim() : !!content.value;

  const onWritten = async (result: WriteResult) => {
    await tagsPost<{ id: string }>("/api/xpot/tag-direct-writes", {
      url: target,
      label: label.trim() || undefined,
      method: result.method,
      verified: result.verified,
      ...leadPayload(lead),
    });
    pushRecent({ kind: "direct", value: target });
    void qc.invalidateQueries({ queryKey: WRITES_KEY });
    if (lead && !lead.leadId) void qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
    show({ tone: "ok", text: t("directSaved") });
  };

  return (
    <>
      <TopBar title={t("directTitle")} eyebrow={t("directEyebrow")} identity="direct" />
      <Banner banner={banner} />

      {/* Desktop: the form on the left, the recent writes beside it. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
        <div>
          <section className="rounded-[20px] border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
            <p className="flex items-start gap-2 text-sm text-white/60">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              {t("directExplain")}
            </p>
            {current && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">{t("onChipNow")}</p>
                <div className="mt-1 flex items-center gap-2">
                  {contentKindOf(current) === "vcard" ? (
                    <span className="min-w-0 flex-1 break-all text-sm font-semibold text-white">{t("contentKind_vcard")}: {contentSummary(current)}</span>
                  ) : (
                    <a href={current} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-all text-sm font-semibold text-white underline-offset-2 active:underline">
                      {contentKindOf(current) === "url" ? current : contentSummary(current)}
                    </a>
                  )}
                  <CopyButton text={current} label={t("copyLink")} />
                </div>
              </div>
            )}
          </section>

          <section className={`${CARD} mt-4 space-y-4 p-4`}>
            {/* The customer first: their Google review link is generated from it. */}
            <div>
              <FieldLabel>{t("customerOptional")}</FieldLabel>
              <LeadPicker value={lead} onChange={setLead} />
              {lead && (
                <GenerateReviewButton
                  name={lead.name}
                  placeId={lead.placeId}
                  currentLink={link}
                  onLink={(url, place) => {
                    setKind("url");
                    setLink(url);
                    if (!label.trim()) setLabel(t("reviewLabelDefault", { name: place?.name || lead.name }).slice(0, 120));
                  }}
                />
              )}
            </div>
            <ContentEditor
              kind={kind}
              onKind={setKind}
              initial={initialContent}
              onChange={setContent}
              showBytes
              urlField={
                <div>
                  <FieldLabel>{current ? t("newLink") : t("customerLink")}</FieldLabel>
                  <LinkInput value={link} onChange={setLink} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
                  <ReviewLinkAssist
                    link={link}
                    onPick={(place) => {
                      setLink(place.reviewUrl);
                      if (!label.trim() && place.name) setLabel(t("reviewLabelDefault", { name: place.name }).slice(0, 120));
                      show({ tone: "ok", text: place.name ? t("reviewReady", { name: place.name }) : t("reviewReadyNoName") });
                    }}
                  />
                </div>
              }
            />
            <div>
              <FieldLabel>{t("labelField")}</FieldLabel>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("directLabelPlaceholder")} maxLength={120} className={INPUT} />
            </div>
            <button type="button" onClick={prepare} disabled={!ready} className={BTN_DIRECT} data-testid="button-write-direct">
              <Nfc className="h-5 w-5" />
              {t("writeToChip")}
            </button>
            {/* The same content as a QR code, to print or show. */}
            <button
              type="button"
              onClick={openQr}
              disabled={!ready}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white/80 transition-colors disabled:opacity-40 active:bg-white/10"
              data-testid="button-direct-qr"
            >
              <QrCode className="h-5 w-5" />
              {t("showQr")}
            </button>
          </section>
        </div>

        <section className="mt-8 lg:mt-0">
          <h2 className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{t("recentDirect")}</h2>
          {!writes || writes.length === 0 ? (
            <div className={`${CARD} px-6 py-8 text-center text-sm text-white/45`}>{t("directEmpty")}</div>
          ) : (
            <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`}>
              {writes.slice(0, 12).map((w) => {
                const age = ageOf(new Date(w.createdAt).getTime());
                return (
                  <li key={w.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`h-9 w-9 ${ICON_BLOCK_DIRECT}`}>
                      {(() => {
                        const Icon = { url: Link2, email: Mail, phone: Phone, vcard: Contact }[contentKindOf(w.url)];
                        return <Icon className="h-4 w-4" />;
                      })()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        reuse(w.url);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-white">{contentKindOf(w.url) === "url" ? shortUrl(w.url) : contentSummary(w.url)}</span>
                      <span className="block truncate text-xs text-white/40">{[w.leadName, w.label].filter(Boolean).join(" · ") || t("noCustomer")}</span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Pill tone={w.verified ? "green" : "slate"}>{w.verified ? t("checked") : t("written")}</Pill>
                      <span className="text-xs text-white/35">{t(age.key, { n: age.n })}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <ContentQr open={qrOpen} value={target} onClose={() => setQrOpen(false)} />

      {/* A direct chip sealed can never change what it opens: LockSheet says so first. */}
      <LockSheet open={lockOpen} identity="direct" onClose={() => setLockOpen(false)} />

      <WriteSheet
        onLock={() => setLockOpen(true)}
        open={writeOpen}
        url={target}
        identity="direct"
        onClose={() => setWriteOpen(false)}
        onDone={onWritten}
        continueUrl={`${window.location.origin}${directPath(target)}`}
        continueHint={t("continueOnPhoneDirectHint")}
      />
    </>
  );
}
