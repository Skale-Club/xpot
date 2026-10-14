import { useCallback, useMemo } from "react";
import { useSearchParams } from "wouter";

/**
 * List filters kept in the query string, so a reload, the back button and a
 * shared link all bring the same list back. `defaults` names the keys this
 * screen owns and the value each has when nothing is chosen; a key at its
 * default is left out of the URL. Other query params (e.g. ?lead=) are kept.
 */
export function useUrlFilters<K extends string>(defaults: Record<K, string>) {
  const [params, setParams] = useSearchParams();
  // Callers pass an object literal; key it by content so the memos below hold.
  const defaultsKey = JSON.stringify(defaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => defaults, [defaultsKey]);
  const keys = useMemo(() => Object.keys(base) as K[], [base]);

  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const key of keys) out[key] = params.get(key) ?? base[key];
    return out;
  }, [base, keys, params]);

  const set = useCallback(
    (patch: Partial<Record<K, string | null | undefined>>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const key of Object.keys(patch) as K[]) {
            const value = patch[key];
            if (value == null || value === "" || value === base[key]) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [base, setParams],
  );

  /** Back to the defaults; `keep` survives (e.g. the view mode). */
  const reset = useCallback(
    (keep: K[] = []) => set(Object.fromEntries(keys.filter((key) => !keep.includes(key)).map((key) => [key, null])) as Partial<Record<K, null>>),
    [keys, set],
  );

  /** How many of `among` (default: all keys) differ from their default. */
  const activeCount = useCallback(
    (among: K[] = keys) => among.filter((key) => values[key] !== base[key]).length,
    [base, keys, values],
  );

  return { values, set, reset, activeCount };
}

/** The current query string, to carry the filters along when opening a row. */
export function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}
