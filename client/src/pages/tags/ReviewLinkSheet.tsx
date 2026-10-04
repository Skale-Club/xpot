import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardPaste, MapPin, Search, Star } from "lucide-react";
import { normalizeUrlInput } from "@shared/tagApp";
import { extractFirstUrl, isReviewFormUrl } from "@shared/reviewLink";
import type { ReviewLinkPlace } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, getPosition, haptic, readClipboard, tagsPost } from "./lib";
import { BTN_PRIMARY, BottomSheet, CARD, EYEBROW_MUTED, INPUT, SHEET_TITLE, Spinner } from "./ui";

/**
 * Finds a business on Google (by name, or from a Maps / share link) and hands
 * back its "write a review" link, so the reseller never needs the customer's
 * Google Business login.
 */
export default function ReviewLinkSheet({
  open,
  initialQuery = "",
  onClose,
  onPick,
}: {
  open: boolean;
  /** Pre-filled and searched right away, e.g. a Maps link already in the destination field. */
  initialQuery?: string;
  onClose: () => void;
  onPick: (place: ReviewLinkPlace) => void;
}) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [query, setQuery] = useState("");
  const [nearMe, setNearMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [places, setPlaces] = useState<ReviewLinkPlace[] | null>(null);
  const run = useRef(0);

  const search = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text.length < 2) return;
      const id = ++run.current;
      setBusy(true);
      setError("");
      setPlaces(null);
      try {
        // Only a name search benefits from where the reseller is standing.
        const coords = !extractFirstUrl(text) && nearMe ? await getPosition() : null;
        const res = await tagsPost<{ places: ReviewLinkPlace[] }>("/api/xpot/tools/review-link", { input: text, ...(coords ?? {}) });
        if (id !== run.current) return;
        if (res.places.length === 0) setError(t("reviewNone"));
        setPlaces(res.places);
      } catch (err) {
        if (id === run.current) setError(errorText(err, tc("requestFailed")));
      } finally {
        if (id === run.current) setBusy(false);
      }
    },
    [nearMe, t, tc],
  );

  // Fresh state on every open; search straight away when opened with a link or name.
  useEffect(() => {
    if (!open) return;
    run.current++;
    setQuery(initialQuery);
    setError("");
    setPlaces(null);
    setBusy(false);
    if (initialQuery.trim()) void search(initialQuery);
    // Only on open: re-running when `search` changes would repeat the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  const paste = async () => {
    const text = await readClipboard();
    if (!text) return setError(tc("pasteFailed"));
    setQuery(text);
    haptic(20);
    void search(text);
  };

  const isLink = !!extractFirstUrl(query);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("reviewTitle")}>
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        <h2 className={SHEET_TITLE}>{t("reviewTitle")}</h2>
      </div>
      <p className="mt-1 text-sm text-white/50">{t("reviewHint")}</p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <div className="flex gap-2">
          <input
            type="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("reviewPlaceholder")}
            className={INPUT}
            data-testid="input-review-search"
          />
          <button
            type="button"
            onClick={() => void paste()}
            className="flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 px-3.5 text-sm font-semibold text-white/80 active:bg-white/10"
          >
            <ClipboardPaste className="h-4 w-4" />
            {tc("paste")}
          </button>
        </div>
        {!isLink && (
          <button type="button" onClick={() => setNearMe((v) => !v)} className="flex items-center gap-2 text-xs text-white/45">
            <MapPin className={`h-4 w-4 ${nearMe ? "text-blue-300" : ""}`} />
            {nearMe ? t("reviewNearMeOn") : t("reviewNearMeOff")}
          </button>
        )}
        <button type="submit" disabled={busy || query.trim().length < 2} className={BTN_PRIMARY} data-testid="button-review-search">
          {busy ? <Spinner /> : <Search className="h-5 w-5" />}
          {busy ? t("reviewSearching") : isLink ? t("reviewGenerate") : t("reviewSearch")}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      {places && places.length > 0 && (
        <section className="mt-5">
          <p className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{places.length === 1 ? t("reviewFoundOne") : t("reviewPickOne")}</p>
          <ul className={`${CARD} divide-y divide-white/10 overflow-hidden`}>
            {places.map((p) => (
              <li key={p.reviewUrl}>
                <button
                  type="button"
                  onClick={() => {
                    haptic(30);
                    onPick(p);
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-white/10"
                  data-testid="button-review-pick"
                >
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">{p.name || t("businessOnGoogle")}</span>
                    {p.address && <span className="block text-xs text-white/45">{p.address}</span>}
                  </span>
                  <span className="shrink-0 self-center text-sm font-semibold text-blue-300">{t("reviewUse")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </BottomSheet>
  );
}

/**
 * Sits under a destination field: a shortcut to find the review link, plus a
 * warning when a Google link that is not the review form is about to be used
 * (a pasted Maps / share link opens the business, not "write a review").
 */
export function ReviewLinkAssist({
  link,
  isReview,
  onPick,
}: {
  link: string;
  /** The destination is meant to be a Google review. */
  isReview: boolean;
  onPick: (place: ReviewLinkPlace) => void;
}) {
  const t = useT(tagsMessages);
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const normalized = normalizeUrlInput(link);
  const notReviewForm = isReview && !!normalized && !isReviewFormUrl(normalized);

  const openWith = (value: string) => {
    setInitialQuery(value);
    setOpen(true);
  };

  return (
    <>
      {notReviewForm ? (
        <div className="mt-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="flex items-start gap-2 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            {t("reviewNotForm")}
          </p>
          <button
            type="button"
            onClick={() => openWith(normalized)}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 text-sm font-bold text-slate-900 active:bg-amber-300"
            data-testid="button-review-convert"
          >
            <Star className="h-4 w-4" />
            {t("reviewConvert")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openWith("")}
          className="mt-2 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-blue-300 active:text-white"
          data-testid="button-review-find"
        >
          <Star className="h-4 w-4 text-amber-400" />
          {t("reviewFind")}
        </button>
      )}
      <ReviewLinkSheet
        open={open}
        initialQuery={initialQuery}
        onClose={() => setOpen(false)}
        onPick={(place) => {
          setOpen(false);
          onPick(place);
        }}
      />
    </>
  );
}
