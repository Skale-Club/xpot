import type { NextFunction, Request, Response } from "express";
import { TAG_DEFAULT_PUBLIC_BASE_URL } from "#shared/tags.js";

// Xpot lives on xpot.place: it is printed on every QR code and NFC chip.
// xpot.skale.club is the legacy domain; the proxy still routes it here, so
// anything arriving on it is sent to the same path on xpot.place, leaving one
// origin for sessions, the installed app and the MCP OAuth issuer.
//
// /api/* is the exception: it keeps answering on the legacy host, because an
// integration (webhooks, the NFC provisioner) may still call it with a
// pinned URL and would not follow a redirect. Those calls are logged so they
// can be moved over and the legacy host retired.

export const CANONICAL_ORIGIN = TAG_DEFAULT_PUBLIC_BASE_URL;
export const LEGACY_HOSTS: ReadonlySet<string> = new Set(["xpot.skale.club"]);

const LOG_EVERY_MS = 60 * 60_000;
const lastLogged = new Map<string, number>();

function hostOf(req: Request): string {
  return (req.headers.host ?? "").toLowerCase().replace(/:\d+$/, "");
}

export function legacyHostRedirect(req: Request, res: Response, next: NextFunction) {
  const host = hostOf(req);
  if (!LEGACY_HOSTS.has(host)) return next();

  if (req.path.startsWith("/api/")) {
    const key = `${req.method} ${req.path}`;
    const now = Date.now();
    if ((lastLogged.get(key) ?? 0) + LOG_EVERY_MS < now) {
      lastLogged.set(key, now);
      console.warn(`[legacy-host] ${host} ${key} — caller should use ${CANONICAL_ORIGIN}`);
    }
    return next();
  }

  // 308 keeps the method and body for anything that is not a plain read.
  const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
  res.redirect(status, `${CANONICAL_ORIGIN}${req.originalUrl}`);
}
