import type { FormEvent, ReactNode } from "react";
import { ChevronRight, MapPin, Search } from "lucide-react";
import { EmptyState } from "@/components/xpot/EmptyState";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { haptic } from "./lib";
import { CARD, EYEBROW_MUTED, INPUT, Spinner } from "./ui";

/** A business found on Google, as the picker lists it. */
export type PickedPlace = { key: string; name?: string | null; address?: string | null };

/**
 * The one "find the business on Google" picker of Tags: a search field (with
 * an optional button beside it and controls under it), then the matches as one
 * list (map pin, name, address, "Use"). ReviewLinkSheet and the customer
 * screen's Google profile both use it, so a business is picked the same way.
 * With `onSubmit` the field searches on Enter; otherwise the caller searches
 * as the person types.
 */
export function PlacePicker<P extends PickedPlace>({
  query,
  onQuery,
  placeholder,
  onSubmit,
  fieldAction,
  children,
  loading = false,
  places,
  heading,
  emptyText,
  disabled = false,
  onPick,
  autoFocus = false,
  inputTestId,
  pickTestId,
}: {
  query: string;
  onQuery: (query: string) => void;
  placeholder: string;
  /** Search on Enter (the review-link lookup); leave out to search while typing. */
  onSubmit?: () => void;
  /** A button right of the field (Paste). */
  fieldAction?: ReactNode;
  /** Controls between the field and the results (a near-me toggle, a Search button). */
  children?: ReactNode;
  loading?: boolean;
  /** null: nothing searched yet. */
  places: readonly P[] | null;
  /** Above the list ("Pick the right business"). */
  heading?: ReactNode;
  /** Shown when a search found nothing. */
  emptyText?: ReactNode;
  disabled?: boolean;
  onPick: (place: P) => void;
  autoFocus?: boolean;
  inputTestId?: string;
  pickTestId?: string;
}) {
  const t = useT(tagsMessages);
  const field = (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
        <input
          type="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`${INPUT} pl-10`}
          data-testid={inputTestId}
        />
      </div>
      {fieldAction}
    </div>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  return (
    <div>
      {onSubmit ? (
        <form className="space-y-3" onSubmit={submit}>
          {field}
          {children}
        </form>
      ) : (
        <div className="space-y-3">
          {field}
          {children}
        </div>
      )}

      {loading && !places?.length ? (
        <div className="flex justify-center py-6 text-white/40">
          <Spinner />
        </div>
      ) : places && places.length > 0 ? (
        <section className="mt-4">
          {heading ? <p className={`mb-2 px-1 ${EYEBROW_MUTED}`}>{heading}</p> : null}
          <ul className={`${CARD} max-h-[50vh] divide-y divide-white/[0.06] overflow-y-auto`}>
            {places.map((place) => (
              <li key={place.key}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    haptic(30);
                    onPick(place);
                  }}
                  className="flex min-h-12 w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.04] active:bg-white/10 disabled:opacity-50 focus-visible:!-outline-offset-2"
                  data-testid={pickTestId}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-white">{place.name || t("businessOnGoogle")}</span>
                    {place.address ? <span className="block truncate text-xs text-white/45">{place.address}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 self-center text-sm font-semibold text-violet-300">
                    {t("reviewUse")}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : emptyText ? (
        <div className="mt-4">
          <EmptyState compact dense tone="tags" icon={MapPin} title={emptyText} />
        </div>
      ) : null}
    </div>
  );
}
