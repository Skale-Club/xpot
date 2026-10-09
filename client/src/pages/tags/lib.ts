import { useCallback, useEffect, useState } from "react";
import { classifyScan, TAGS_APP_PATH, type ScanClassification } from "@shared/tagApp";
import { viewHeaders } from "@/lib/adminMode";

export const APP_BASE = TAGS_APP_PATH;
const RECENTS_KEY = "xpot.tags.recents";
const RECENTS_LIMIT = 15;

// ─── Storage ──────────────────────────────────────────────────────────────────

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the app still works, it just forgets.
  }
}

export interface RecentItem {
  kind: "xpot" | "direct";
  /** Tag code, or the direct URL. */
  value: string;
  at: number;
}

export function getRecents(): RecentItem[] {
  const list = readStorage<RecentItem[]>(RECENTS_KEY, []);
  return Array.isArray(list) ? list.filter((r) => r && (r.kind === "xpot" || r.kind === "direct")) : [];
}

export function pushRecent(item: Omit<RecentItem, "at">) {
  const rest = getRecents().filter((r) => !(r.kind === item.kind && r.value === item.value));
  writeStorage(RECENTS_KEY, [{ ...item, at: Date.now() }, ...rest].slice(0, RECENTS_LIMIT));
}

export function clearRecents() {
  writeStorage(RECENTS_KEY, []);
}

// ─── Selling during a visit ───────────────────────────────────────────────────

const SELL_TO_KEY = "xpot.tags.sellTo";
const SELL_TO_TTL_MS = 3 * 60 * 60 * 1000;

/** The customer a reseller is selling to right now (set from an active visit). */
export interface SellTo {
  leadId: number;
  name: string;
  placeId: string | null;
  at: number;
}

export function getSellTo(): SellTo | null {
  const value = readStorage<SellTo | null>(SELL_TO_KEY, null);
  if (!value || typeof value.leadId !== "number" || Date.now() - value.at > SELL_TO_TTL_MS) return null;
  return value;
}

export function setSellTo(value: Omit<SellTo, "at">) {
  writeStorage(SELL_TO_KEY, { ...value, at: Date.now() });
}

export function clearSellTo() {
  writeStorage(SELL_TO_KEY, null);
}

// ─── Device helpers ───────────────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    return (await navigator.clipboard.readText()).trim() || null;
  } catch {
    return null;
  }
}

export function haptic(pattern: number | number[] = 40) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Current position for "near me" searches; null when refused or slow. */
export function getPosition(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300_000 },
    );
  });
}

export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

/** Minutes/hours/days since `at`, as an i18n key and its number. */
export function ageOf(at: number): { key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo"; n: number } {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 60) return { key: "justNow", n: 0 };
  const min = Math.round(sec / 60);
  if (min < 60) return { key: "minutesAgo", n: min };
  const hours = Math.round(min / 60);
  if (hours < 24) return { key: "hoursAgo", n: hours };
  return { key: "daysAgo", n: Math.round(hours / 24) };
}

// ─── API ──────────────────────────────────────────────────────────────────────

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

async function call<T>(method: "GET" | "POST", url: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { ...viewHeaders(), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    // Session gone: back to the sign-in screen.
    window.location.assign("/");
    throw new HttpError(401, "Authentication required");
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      // Not JSON: keep the status text.
    }
    throw new HttpError(res.status, message);
  }
  return (await res.json()) as T;
}

export const tagsGet = <T,>(url: string) => call<T>("GET", url);
export const tagsPost = <T,>(url: string, body: unknown = {}) => call<T>("POST", url, body);
export const tagsPostIdempotent = <T,>(url: string, body: unknown, key: string) =>
  call<T>("POST", url, body, { "Idempotency-Key": key });

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export type LookupResult = { ok: true; id: string; publicCode: string } | { ok: false; reason: "not_found" | "not_yours" };

/** Distinguishes "no such tag" and "not in your kit" from other failures. */
export async function lookupTag(code: string): Promise<LookupResult> {
  try {
    const found = await call<{ id: string; publicCode: string }>("GET", `/api/xpot/tags/lookup/${encodeURIComponent(code)}`);
    return { ok: true, ...found };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return { ok: false, reason: "not_found" };
    if (err instanceof HttpError && err.status === 403 && /kit/i.test(err.message)) return { ok: false, reason: "not_yours" };
    throw err;
  }
}

// ─── Scan routing ─────────────────────────────────────────────────────────────

/** The host serving the app also counts as a tag host (staging, previews). */
export function classify(raw: string): ScanClassification {
  const host = window.location.hostname;
  return classifyScan(raw, host === "xpot.place" || host === "www.xpot.place" ? [] : [host]);
}

export function directPath(url?: string): string {
  return url ? `${APP_BASE}/direct?url=${encodeURIComponent(url)}` : `${APP_BASE}/direct`;
}

export function tagPath(code: string): string {
  return `${APP_BASE}/t/${encodeURIComponent(code)}`;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export type BannerState = { tone: "ok" | "error"; text: string } | null;

/** Auto-dismissing inline banner state. */
export function useBanner() {
  const [banner, setBanner] = useState<BannerState>(null);
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), banner.tone === "ok" ? 3500 : 7000);
    return () => window.clearTimeout(id);
  }, [banner]);
  const clear = useCallback(() => setBanner(null), []);
  return { banner, show: setBanner, clear };
}
