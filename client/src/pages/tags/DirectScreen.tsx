import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Link2, Nfc } from "lucide-react";
import { validateDestinationUrl } from "@shared/tags";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import type { DirectWriteItem } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import LeadPicker, { leadPayload, type LeadChoice } from "./LeadPicker";
import { ReviewLinkAssist } from "./ReviewLinkSheet";
import WriteSheet, { type WriteResult } from "./WriteSheet";
import { ageOf, pushRecent, shortUrl, tagsGet, tagsPost, useBanner } from "./lib";
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
  const [label, setLabel] = useState("");
  const [lead, setLead] = useState<LeadChoice>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [target, setTarget] = useState("");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("url");
    if (param) {
      setCurrent(param);
      setLink(param);
      pushRecent({ kind: "direct", value: param });
    }
  }, []);

  const { data: writes } = useQuery({
    queryKey: WRITES_KEY,
    queryFn: () => tagsGet<DirectWriteItem[]>("/api/xpot/tag-direct-writes"),
    staleTime: 15_000,
  });

  const prepare = () => {
    const check = validateDestinationUrl(normalizeUrlInput(link), { allowHttp: true });
    if (!check.ok) return show({ tone: "error", text: t("invalidLink") });
    setTarget(check.url);
    setWriteOpen(true);
  };

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

      <section className="rounded-[20px] border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
        <p className="flex items-start gap-2 text-sm text-white/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          {t("directExplain")}
        </p>
        {current && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">{t("onChipNow")}</p>
            <div className="mt-1 flex items-center gap-2">
              <a href={current} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-all text-sm font-semibold text-white underline-offset-2 active:underline">
                {current}
              </a>
              <CopyButton text={current} label={t("copyLink")} />
            </div>
          </div>
        )}
      </section>

      <section className={`${CARD} mt-4 space-y-4 p-4`}>
        <div>
          <FieldLabel>{current ? t("newLink") : t("customerLink")}</FieldLabel>
          <LinkInput value={link} onChange={setLink} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
          <ReviewLinkAssist
            link={link}
            isReview={!!link.trim() && guessDestinationType(link) === "google_review"}
            onPick={(place) => {
              setLink(place.reviewUrl);
              if (!label.trim() && place.name) setLabel(t("reviewLabelDefault", { name: place.name }).slice(0, 120));
              show({ tone: "ok", text: place.name ? t("reviewReady", { name: place.name }) : t("reviewReadyNoName") });
            }}
          />
        </div>
        <div>
          <FieldLabel>{t("customerOptional")}</FieldLabel>
          <LeadPicker value={lead} onChange={setLead} />
        </div>
        <div>
          <FieldLabel>{t("labelField")}</FieldLabel>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("directLabelPlaceholder")} maxLength={120} className={INPUT} />
        </div>
        <button type="button" onClick={prepare} disabled={!link.trim()} className={BTN_DIRECT} data-testid="button-write-direct">
          <Nfc className="h-5 w-5" />
          {t("writeToChip")}
        </button>
      </section>

      <section className="mt-8">
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
                    <Link2 className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLink(w.url);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-semibold text-white">{shortUrl(w.url)}</span>
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

      <WriteSheet open={writeOpen} url={target} identity="direct" onClose={() => setWriteOpen(false)} onDone={onWritten} />
    </>
  );
}
