import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste, MapPin, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import { buildReviewUrl, extractFirstUrl, isReviewFormUrl } from "@shared/reviewLink";
import type { ReviewLinkPlace } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, getPosition, haptic, readClipboard, tagsPost } from "./lib";
import { PlacePicker } from "./PlacePicker";
import { BottomSheet } from "./ui";

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
    <BottomSheet open={open} onClose={onClose} title={t("reviewTitle")} icon={<Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" />}>
      <p className="text-sm text-white/50">{t("reviewHint")}</p>

      <div className="mt-4">
        <PlacePicker
          query={query}
          onQuery={setQuery}
          placeholder={t("reviewPlaceholder")}
          onSubmit={() => void search(query)}
          inputTestId="input-review-search"
          pickTestId="button-review-pick"
          fieldAction={
            <Button type="button" variant="secondary" onClick={() => void paste()} className="min-h-11 shrink-0">
              <ClipboardPaste />
              {tc("paste")}
            </Button>
          }
          loading={busy}
          places={places?.map((p) => ({ ...p, key: p.reviewUrl })) ?? null}
          heading={places?.length === 1 ? t("reviewFoundOne") : t("reviewPickOne")}
          emptyText={places && places.length === 0 ? t("reviewNone") : undefined}
          onPick={(p) => onPick(p)}
        >
          {!isLink && (
            <button type="button" onClick={() => setNearMe((v) => !v)} className="flex min-h-10 items-center gap-2 text-xs text-white/45">
              <MapPin className={`h-4 w-4 ${nearMe ? "text-violet-300" : ""}`} />
              {nearMe ? t("reviewNearMeOn") : t("reviewNearMeOff")}
            </button>
          )}
          <Button type="submit" variant="brand" accent="tags" size="lg" loading={busy} disabled={query.trim().length < 2} className="w-full" data-testid="button-review-search">
            <Search className="!size-5" />
            {isLink ? t("reviewGenerate") : t("reviewSearch")}
          </Button>
        </PlacePicker>
      </div>

      {error && <InlineAlert tone="error" className="mt-4">{error}</InlineAlert>}
    </BottomSheet>
  );
}

/**
 * Sits under a link field and stays out of the way: only when a Google link
 * that is not the "write a review" form is typed or pasted (a Maps / share
 * link opens the business, not the review form) does it offer the conversion.
 * Generating a review link from scratch is GenerateReviewButton, under the customer.
 */
export function ReviewLinkAssist({
  link,
  onPick,
}: {
  link: string;
  onPick: (place: ReviewLinkPlace) => void;
}) {
  const t = useT(tagsMessages);
  const [open, setOpen] = useState(false);
  const normalized = normalizeUrlInput(link);
  const notReviewForm = !!normalized && guessDestinationType(normalized) === "google_review" && !isReviewFormUrl(normalized);
  if (!notReviewForm && !open) return null;

  return (
    <>
      {notReviewForm && (
        <div className="mt-2 space-y-2">
          <InlineAlert tone="warning">{t("reviewNotForm")}</InlineAlert>
          <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="w-full" data-testid="button-review-convert">
            <Star className="text-amber-300" />
            {t("reviewConvert")}
          </Button>
        </div>
      )}
      <ReviewLinkSheet
        open={open}
        initialQuery={normalized}
        onClose={() => setOpen(false)}
        onPick={(place) => {
          setOpen(false);
          onPick(place);
        }}
      />
    </>
  );
}

/**
 * Under the customer field: turns the chosen customer into their Google
 * "write a review" link. With the customer's Google place on file it is
 * instant; otherwise it searches Google for the customer's name (near the
 * reseller) and they pick the right business. The generated link is shown.
 */
export function GenerateReviewButton({
  name,
  placeId,
  currentLink,
  onLink,
}: {
  name: string;
  placeId: string | null | undefined;
  /** The link in the form now, to show when it is this customer's review link. */
  currentLink: string;
  onLink: (url: string, place: ReviewLinkPlace | null) => void;
}) {
  const t = useT(tagsMessages);
  const [open, setOpen] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const shown = generated && normalizeUrlInput(currentLink) === generated ? generated : null;

  const generate = () => {
    if (placeId) {
      const url = buildReviewUrl(placeId);
      haptic(30);
      setGenerated(url);
      onLink(url, null);
    } else setOpen(true);
  };

  return (
    <>
      {/* A plain secondary action; the stars are Google's rating colour, not a warning. */}
      <Button type="button" variant="secondary" size="lg" onClick={generate} className="mt-2 w-full" data-testid="button-generate-review">
        <Star className="fill-amber-400 text-amber-400" />
        <span className="min-w-0 truncate">{t("reviewGenerateFor", { name })}</span>
      </Button>
      {shown && (
        <div className="mt-2" data-testid="review-generated">
          <InlineAlert tone="success" title={t("reviewGenerated")}>
            <a href={shown} target="_blank" rel="noopener noreferrer" className="block break-all font-semibold text-white underline-offset-2 active:underline">
              {shown}
            </a>
          </InlineAlert>
        </div>
      )}
      <ReviewLinkSheet
        open={open}
        initialQuery={name}
        onClose={() => setOpen(false)}
        onPick={(place) => {
          setOpen(false);
          setGenerated(place.reviewUrl);
          onLink(place.reviewUrl, place);
        }}
      />
    </>
  );
}
