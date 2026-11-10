// Local development only: walk through what a computer goes through before it prints, without installing anything.
// The stage switcher (DesktopPreviewSwitcher) stores a pretend state of this computer (Xpot Desktop absent, installed
// with steps left, ready); askDesktop answers from it instead of the real Xpot Desktop. In a production build `previewOn` is false, so none of
// this runs.

export type PreviewItemId = "connection" | "pipeline" | "packages" | "studio" | "fonts";
export type PreviewComputer = "real" | "absent" | "installed" | "ready";

export const PREVIEW_ITEMS: readonly PreviewItemId[] = ["connection", "pipeline", "packages", "studio", "fonts"];

type PreviewState = { computer: PreviewComputer; done: PreviewItemId[] };

const KEY = "xpot-desktop-preview";
const EVENT = "xpot-desktop-preview";
const IDLE: PreviewState = { computer: "real", done: [] };

export const previewOn = import.meta.env.DEV;

export function readPreview(): PreviewState {
  if (!previewOn) return IDLE;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as PreviewState | null;
    return saved ? { ...IDLE, ...saved } : IDLE;
  } catch {
    return IDLE;
  }
}

export function writePreview(next: Partial<PreviewState>) {
  const state = { ...readPreview(), ...next };
  // "Ready" is every item done; "installed" keeps what was done so far.
  if (next.computer === "ready") state.done = [...PREVIEW_ITEMS];
  if (next.computer === "absent" || next.computer === "real") state.done = [];
  if (state.computer === "installed" && state.done.length === PREVIEW_ITEMS.length) state.computer = "ready";
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A private window without storage: the switcher simply does nothing.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onPreviewChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** What the pretend Xpot Desktop answers for `path`; null when the real one should be asked. Throws when it is absent. */
export function previewDesktopAnswer(path: string): { supported: boolean; computerName: string; items: { id: PreviewItemId; state: "ok" | "missing"; detail: null }[]; ready: boolean; building: boolean; readers: string[] } | null {
  const state = readPreview();
  if (state.computer === "real") return null;
  if (state.computer === "absent") throw new Error("Xpot Desktop is not running (preview)");
  const install = /^\/(?:install\/(\w+)|connect)$/.exec(path);
  if (install) {
    const id = (install[1] ?? "connection") as PreviewItemId;
    if (PREVIEW_ITEMS.includes(id) && !state.done.includes(id)) writePreview({ done: [...state.done, id] });
  }
  const done = readPreview().done;
  const items = PREVIEW_ITEMS.map((id) => ({ id, state: done.includes(id) ? "ok" as const : "missing" as const, detail: null }));
  return { supported: true, computerName: "This PC (preview)", items, ready: items.every((item) => item.state === "ok"), building: false, readers: [] };
}
