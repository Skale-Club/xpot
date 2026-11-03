import type { CustomerContactResponse, CustomerPieceDetail, CustomerPiecesResponse } from "@shared/customerPanel";
import type { GoogleLoginConfig } from '@/lib/googleIdentity';

// The customer panel's calls. Plain fetch: this app is not the team's, so it sends none of the team app's headers and
// never touches /api/xpot.

export class MyApiError extends Error {
  constructor(public status: number, public code: string | null, public retryAfter: number | null) {
    super(code ?? `HTTP ${status}`);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { code?: unknown; retryAfter?: unknown } | null;
  if (!res.ok) {
    throw new MyApiError(res.status, typeof data?.code === "string" ? data.code : null, typeof data?.retryAfter === "number" ? data.retryAfter : null);
  }
  return data as T;
}

export const MY_KEYS = {
  enabled: ["/api/my/enabled"],
  pieces: ["/api/my/pieces"],
  piece: (code: string) => ["/api/my/pieces", code],
  contact: ["/api/my/contact"],
} as const;

/** What belongs to a signed-in customer (everything under /api/my but the flag), for clearing it on sign-in and out. */
export const isSessionQuery = (query: { queryKey: readonly unknown[] }) =>
  typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/my/") && query.queryKey[0] !== MY_KEYS.enabled[0];

export const myApi = {
  enabled: () => request<{ enabled: boolean }>("GET", "/api/my/enabled"),
  pieces: () => request<CustomerPiecesResponse>("GET", "/api/my/pieces"),
  piece: (code: string) => request<CustomerPieceDetail>("GET", `/api/my/pieces/${encodeURIComponent(code)}`),
  contact: () => request<CustomerContactResponse>("GET", "/api/my/contact"),
  askCode: (input: { code: string; phone: string; countryCode: string; lang: string }) =>
    request<{ ok: true; phone: string; provider?:'google'; google?:GoogleLoginConfig }>("POST", "/api/my/code", input),
  verify: (input: { phone: string; otp: string } | { idToken:string }) => request<{ ok: true }>("POST", "/api/my/verify", input),
  signOut: () => request<{ ok: true }>("POST", "/api/my/sign-out"),
};

/** The screen's words for a failed sign-in call, by the server's code (shared/customerPanel.ts CustomerErrorCode). */
export const SIGN_IN_ERROR_KEYS = {
  invalid_phone: "errInvalidPhone",
  rate_limited: "errRateLimited",
  too_many_codes: "errRateLimited",
  code_expired: "errCodeExpired",
  wrong_code: "errWrongCode",
  too_many_attempts: "errTooManyAttempts",
  no_access: "errNoAccess",
} as const;
