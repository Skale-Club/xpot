/**
 * Direct client for gosom/google-maps-scraper in web/API mode.
 *
 * Xpot owns the jobs, queue, normalized candidates and users. This process is only
 * an execution engine; its URL may point at today's Home Lab or tomorrow's hosted
 * server without changing any Xpot account or API contract.
 */

export const START_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
export const ENGINE_OVERDUE_GRACE_MS = 10 * 60 * 1000;

export type EngineStatus = "running" | "completed" | "failed";

export type NormalizedPlace = {
  sourceId: string;
  googlePlaceId: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  industry: string | null;
  rating: number | null;
  reviewCount: number | null;
  rawPayload: Record<string, unknown>;
};

export class ProspectingEngineError extends Error {
  constructor(message: string, readonly code: "not_configured" | "unreachable" | "rejected" | "not_found" | "bad_response") {
    super(message);
    this.name = "ProspectingEngineError";
  }
}
function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEngineSettings() {
  return {
    maxTimeSeconds: positiveInt(process.env.PROSPECTING_ENGINE_MAX_TIME_SECONDS, 1800),
    maxDepth: positiveInt(process.env.PROSPECTING_ENGINE_DEPTH, 10),
  };
}

export function getEngineConfig() {
  const rawUrl = process.env.PROSPECTING_ENGINE_URL?.trim();
  if (!rawUrl) return null;
  const clientId = process.env.PROSPECTING_ENGINE_CF_CLIENT_ID?.trim() || null;
  const clientSecret = process.env.PROSPECTING_ENGINE_CF_CLIENT_SECRET?.trim() || null;
  if (Boolean(clientId) !== Boolean(clientSecret)) return null;
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return {
      baseUrl: url.toString().replace(/\/+$/, ""),
      clientId,
      clientSecret,
      ...getEngineSettings(),
    };
  } catch {
    return null;
  }
}

export function isEngineConfigured() {
  return getEngineConfig() !== null;
}

async function engineRequest(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number }) {
  const config = getEngineConfig();
  if (!config) throw new ProspectingEngineError("The prospecting engine is not configured.", "not_configured");
  const headers: Record<string, string> = { Accept: "application/json, text/csv" };
  if (config.clientId && config.clientSecret) {
    headers["CF-Access-Client-Id"] = config.clientId;
    headers["CF-Access-Client-Secret"] = config.clientSecret;
  }
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch {
    throw new ProspectingEngineError("The prospecting engine is unavailable (network error).", "unreachable");
  }
  if ((response.status >= 300 && response.status < 400) || [401, 403].includes(response.status)) {
    throw new ProspectingEngineError(`The prospecting engine rejected the request (HTTP ${response.status}).`, "rejected");
  }
  if (response.status === 404) {
    throw new ProspectingEngineError("The prospecting engine no longer knows this job (HTTP 404).", "not_found");
  }
  if (!response.ok) {
    throw new ProspectingEngineError(`The prospecting engine is unavailable (HTTP ${response.status}).`, "unreachable");
  }
  return response;
}

export function depthForMaxResults(maxResults: number, maxDepth: number) {
  return Math.min(maxDepth, Math.max(2, Math.ceil(maxResults / 12) + 1));
}

export function buildEngineInput(query: string, location: string, maxResults: number) {
  const settings = getEngineSettings();
  const keyword = `${query.trim()} in ${location.trim()}`;
  return {
    name: `xpot: ${keyword}`.slice(0, 120),
    keywords: [keyword],
    lang: "en",
    depth: depthForMaxResults(maxResults, settings.maxDepth),
    email: true,
    max_time: settings.maxTimeSeconds,
    fast_mode: false,
  };
}

export async function startEngineJob(input: Record<string, unknown>) {
  const response = await engineRequest("/api/v1/jobs", { method: "POST", body: input, timeoutMs: START_TIMEOUT_MS });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const id = body && (typeof body.id === "string" ? body.id : typeof body.ID === "string" ? body.ID : null);
  if (!id) throw new ProspectingEngineError("The prospecting engine returned no job id.", "bad_response");
  return id;
}

export function mapEngineStatus(rawStatus: unknown): { status: EngineStatus; progress: number } {
  const raw = String(rawStatus ?? "").trim().toLowerCase();
  if (raw === "ok") return { status: "completed", progress: 100 };
  if (raw === "failed") return { status: "failed", progress: 0 };
  return { status: "running", progress: raw === "pending" ? 10 : 50 };
}

export async function getEngineJobStatus(jobId: string): Promise<{ status: EngineStatus; progress: number }> {
  const response = await engineRequest(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET", timeoutMs: STATUS_TIMEOUT_MS });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) throw new ProspectingEngineError("The prospecting engine returned invalid status data.", "bad_response");
  return mapEngineStatus(body.Status ?? body.status);
}

export async function downloadEngineCsv(jobId: string) {
  const response = await engineRequest(`/api/v1/jobs/${encodeURIComponent(jobId)}/download`, {
    method: "GET",
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
  });
  return response.text();
}

export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((item) => item.some((cell) => cell.trim().length));
}

function first(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function numberValue(value: unknown): number | null {
  const normalized = first(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Site templates and scraped page assets fill the engine's "emails" column with
 * addresses nobody reads (user@domain.com, info@example.com, logo@2x.png). They
 * would score as "email available", so they are dropped here.
 */
const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "domain.com", "yourdomain.com", "mydomain.com",
  "email.com", "test.com", "yoursite.com", "yourwebsite.com", "website.com", "company.com",
  "sentry.io", "sentry.wixpress.com", "sentry-next.wixpress.com",
]);
const PLACEHOLDER_EMAIL_USERS = new Set(["user", "username", "your", "yourname", "name", "email", "youremail", "example", "test", "johndoe", "john.doe", "janedoe", "jane.doe"]);
const ASSET_SUFFIX = /\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js)$/i;

export function isPlaceholderEmail(email: string) {
  const [user = "", domain = ""] = email.toLowerCase().split("@");
  return PLACEHOLDER_EMAIL_DOMAINS.has(domain) || PLACEHOLDER_EMAIL_USERS.has(user) || ASSET_SUFFIX.test(domain);
}

export function firstEmail(value: unknown): string | null {
  const text = typeof value === "string" ? value : Array.isArray(value) ? value.join(" ") : "";
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return matches.map((email) => email.toLowerCase()).find((email) => !isPlaceholderEmail(email)) ?? null;
}

/**
 * Listing farms copy Google Maps businesses onto throwaway domains
 * (mapstuk.top/the-barber-lounge-…) and put them in the website field. Such a
 * link is not the business's site, so the place counts as having none; the raw
 * value stays in rawPayload.
 */
const SPAM_WEBSITE_TLDS = new Set(["top"]);

export function businessWebsite(value: unknown): string | null {
  const raw = first(value);
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`).hostname.toLowerCase();
    if (SPAM_WEBSITE_TLDS.has(host.split(".").pop() ?? "")) return null;
  } catch {
    return null;
  }
  return raw;
}

export function parseEngineResults(csv: string, limit: number): NormalizedPlace[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const keys = header.map((cell) => cell.trim());
  return rows.slice(0, limit).map((cells) => Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""])))
    .map((raw): NormalizedPlace | null => {
      const name = first(raw.title);
      if (!name) return null;
      let complete: Record<string, unknown> = {};
      try { complete = JSON.parse(first(raw.complete_address) || "{}"); } catch { /* raw address remains usable */ }
      const googlePlaceId = first(raw.place_id);
      const cid = first(raw.cid);
      const street = first(complete.street);
      const city = first(complete.city);
      const state = first(complete.state);
      const postalCode = first(complete.postal_code ?? complete.postalCode ?? complete.zip);
      const country = first(complete.country);
      const composedAddress = [street, city, [state, postalCode].filter(Boolean).join(" ") || null, country]
        .filter(Boolean).join(", ");
      const address = first(raw.address) || composedAddress || null;
      const sourceId = googlePlaceId || (cid ? `cid:${cid}` : `place:${name.toLowerCase()}|${(address || "").toLowerCase()}`);
      return {
        sourceId,
        googlePlaceId,
        name,
        address,
        city,
        state,
        postalCode,
        country,
        lat: numberValue(raw.latitude),
        lng: numberValue(raw.longitude),
        phone: first(raw.phone),
        email: firstEmail(raw.emails),
        website: businessWebsite(raw.website),
        industry: first(raw.category),
        rating: numberValue(raw.review_rating),
        reviewCount: numberValue(raw.review_count),
        rawPayload: raw,
      };
    }).filter((place): place is NormalizedPlace => place !== null);
}
