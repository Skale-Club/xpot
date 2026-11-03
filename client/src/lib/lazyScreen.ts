import { lazy, type ComponentType } from "react";

/** Share the download between navigation intent and React's first render. */
export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let pending: Promise<{ default: T }> | undefined;
  const preload = () => pending ??= load().catch((error) => {
    // A speculative download must not prevent a later navigation from retrying.
    pending = undefined;
    throw error;
  });
  return Object.assign(lazy(preload), { preload });
}
