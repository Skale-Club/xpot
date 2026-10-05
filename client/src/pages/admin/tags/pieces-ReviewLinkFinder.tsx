import { useState } from "react";
import { Search, Star } from "lucide-react";
import type { ReviewLinkPlace } from "@shared/tagsApi";
import { Loader2 } from "@/components/ui/loader";
import { errorMessage, sendJson } from "./api";
import { BTN_GHOST, INPUT } from "./ui";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";

/**
 * Finds the business on Google (name + city, or a Maps / share link) and hands
 * back its "write a review" link — no access to the customer's Google Business
 * account needed. Same resolver as the field app.
 */
export function ReviewLinkFinder({ initialQuery = "", onPick }: { initialQuery?: string; onPick: (place: ReviewLinkPlace) => void }) {
  const t = useT(manageTagsPiecesMessages);
  const tt = useT(tagsMessages);
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [places, setPlaces] = useState<ReviewLinkPlace[] | null>(null);

  const search = async () => {
    const text = query.trim();
    if (text.length < 2 || busy) return;
    setBusy(true);
    setError("");
    setPlaces(null);
    try {
      const res = await sendJson<{ places: ReviewLinkPlace[] }>("POST", "/api/xpot/tools/review-link", { input: text });
      const found = res.places ?? [];
      if (found.length === 0) setError(tt("reviewNone"));
      setPlaces(found);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-xs font-medium text-white/50">{t("finderHint")}</p>
      {/* Not a <form>: this sits inside the destination form. */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={t("finderPlaceholder")}
          autoCapitalize="off"
          autoCorrect="off"
          className={INPUT}
          data-testid="admin-piece-review-search"
        />
        <button type="button" className={`${BTN_GHOST} shrink-0`} onClick={() => void search()} disabled={busy || query.trim().length < 2}>
          {busy ? <Loader2 className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          {t("find")}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {places && places.length > 0 ? (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
          {places.map((p) => (
            <li key={p.reviewUrl}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                data-testid="admin-piece-review-pick"
              >
                <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-white">{p.name || tt("businessOnGoogle")}</span>
                  {p.address ? <span className="block text-xs text-white/40">{p.address}</span> : null}
                </span>
                <span className="shrink-0 self-center text-xs font-medium text-blue-400">{tt("reviewUse")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
