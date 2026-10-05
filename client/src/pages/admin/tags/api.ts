import { queryClient } from "@/lib/queryClient";
import { currentLocale, translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

// Fetch helpers for the Tags admin (/api/xpot/admin/tag*). The server answers
// errors as JSON { message }; only the message reaches the admin.

export class AdminHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminHttpError";
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = translate(commonMessages, "requestFailed");
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      // not JSON
    }
    throw new AdminHttpError(res.status, message);
  }
  return (await res.json()) as T;
}

export const getJson = <T,>(url: string) => request<T>("GET", url);
export const sendJson = <T,>(method: "POST" | "PATCH", url: string, body: unknown = {}) => request<T>(method, url, body);

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : translate(commonMessages, "requestFailed");
}

export function withQuery(url: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Every Tags admin query key starts with this, so one call refreshes them all. */
export const ADMIN_TAGS_KEY = "admin-tags";

export function invalidateAdminTags() {
  return queryClient.invalidateQueries({ queryKey: [ADMIN_TAGS_KEY] });
}

export const STALE_MS = 30_000;

/** Dates follow the app's language, not the browser's. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(currentLocale(), { dateStyle: "medium" });
}

export function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
