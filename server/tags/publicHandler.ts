import type { Request, RequestHandler, Response } from "express";
import {
  normalizeTagCode,
  resolveRedirectTarget,
  type TagAccessMethod,
  type TagEventType,
} from "#shared/tags.js";
import type { InsertTagEvent } from "#shared/schema.js";
import { contentSummary, validateChipContent } from "#shared/chipContent.js";
import { formatPhone } from "#shared/phone.js";
import { normalizeIpKey, rateLimit } from "./rateLimit.js";
import {
  browserFamilyFromUserAgent,
  deviceTypeFromUserAgent,
  isBotUserAgent,
  osFamilyFromUserAgent,
  referrerHost,
  trustedCountryCode,
  visitorDayKey,
} from "./requestInfo.js";
import { pickTagPageLang, renderContactPage, renderTagPage } from "./publicPages.js";

/** The slice of a tag the public routes need — never customer data. */
export interface PublicTag {
  id: string;
  publicCode: string;
  leadId: number | null;
  repId: number | null;
  status: string;
  destinationUrl: string | null;
  utmEnabled: boolean;
  utmCampaign: string | null;
}

export interface PublicTagDeps {
  findByCode(code: string): Promise<PublicTag | null>;
  recordEvent(event: InsertTagEvent): Promise<void>;
  /**
   * Link to the field app for this tag when the requester is signed in and may
   * work on it (its reseller, or a manager); undefined for everyone else.
   */
  configureUrlFor(req: Request, tag: PublicTag): Promise<string | undefined>;
}

// Event writes per client IP per minute. Over the limit the redirect still
// happens; only the analytics row is skipped.
const EVENT_LIMIT = { limit: 60, windowMs: 60_000 };

function setPublicHeaders(res: Response) {
  // Destination changes must take effect on the very next scan.
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

export function buildEvent(
  req: Request,
  tag: Pick<PublicTag, "id" | "leadId" | "repId">,
  method: TagAccessMethod,
  eventType: TagEventType,
  now: Date = new Date(),
): InsertTagEvent {
  const ua = req.get("user-agent") ?? "";
  return {
    tagId: tag.id,
    leadId: tag.leadId,
    repId: tag.repId,
    accessMethod: method,
    eventType,
    occurredAt: now,
    visitorDayKey: visitorDayKey(req.ip, ua, now),
    deviceType: ua ? deviceTypeFromUserAgent(ua) : null,
    osFamily: ua ? osFamilyFromUserAgent(ua) : null,
    browserFamily: ua ? browserFamilyFromUserAgent(ua) : null,
    countryCode: trustedCountryCode(req.headers),
    referrer: referrerHost(req.get("referer")),
    isBot: isBotUserAgent(ua),
    requestId: req.get("x-request-id")?.slice(0, 100) ?? null,
  };
}

async function record(
  deps: PublicTagDeps,
  req: Request,
  tag: PublicTag,
  method: TagAccessMethod,
  eventType: TagEventType,
) {
  // HEAD (link checkers, prefetchers) is not an interaction.
  if (req.method !== "GET") return;
  if (rateLimit(`tag-event:${normalizeIpKey(req.ip)}`, EVENT_LIMIT)) return;
  try {
    await deps.recordEvent(buildEvent(req, tag, method, eventType));
  } catch (err) {
    console.error(`[tags] failed to record ${eventType} for ${tag.publicCode}:`, err);
  }
}

/**
 * GET /q/:code and GET /n/:code. Server-side 302 to the tag's current
 * destination; the analytics write happens after the response is sent and can
 * never block or break the redirect.
 */
export function createTagRedirectHandler(method: TagAccessMethod, deps: PublicTagDeps): RequestHandler {
  return async (req, res) => {
    setPublicHeaders(res);
    const lang = pickTagPageLang(req.get("accept-language"));

    const code = normalizeTagCode(req.params.code);
    if (!code) {
      res.status(404).type("html").send(renderTagPage("not_found", { lang }));
      return;
    }

    let tag: PublicTag | null;
    try {
      tag = await deps.findByCode(code);
    } catch (err) {
      console.error(`[tags] lookup failed for ${code}:`, err);
      res.status(503).type("html").send(renderTagPage("unavailable", { lang }));
      return;
    }

    if (!tag) {
      res.status(404).type("html").send(renderTagPage("not_found", { lang }));
      return;
    }

    if (tag.status === "active") {
      const target = resolveRedirectTarget(tag, method);
      // Stored URLs were validated on write; re-check so a bad row can never
      // turn into an open javascript:/data: redirect.
      const valid = target ? validateChipContent(target, { allowHttp: true }) : null;
      if (!valid?.ok) {
        console.error(`[tags] active tag ${tag.publicCode} has no valid destination`);
        res.status(503).type("html").send(renderTagPage("unavailable", { lang }));
        await record(deps, req, tag, method, "misconfigured_scan");
        return;
      }
      // A link redirects; an email or phone gets a page that opens it; a contact card downloads.
      if (valid.kind === "url") res.redirect(302, valid.value);
      else if (valid.kind === "vcard") {
        const name = contentSummary(valid.value).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "contact";
        res.status(200).type("text/vcard; charset=utf-8");
        res.set("Content-Disposition", `inline; filename="${name}.vcf"`);
        res.send(valid.value);
      } else {
        const display = valid.kind === "phone" ? formatPhone(contentSummary(valid.value)) : contentSummary(valid.value);
        res.status(200).type("html").send(renderContactPage(valid.kind, { href: valid.value, display, lang }));
      }
      await record(deps, req, tag, method, "redirect");
      return;
    }

    if (tag.status === "inventory" || tag.status === "assigned") {
      let configureUrl: string | undefined;
      try {
        configureUrl = await deps.configureUrlFor(req, tag);
      } catch {
        configureUrl = undefined;
      }
      // Scan → configure → live, straight from the piece in the reseller's hand.
      const page = tag.status === "assigned" ? "assigned" : "inventory";
      res.status(200).type("html").send(renderTagPage(page, { code: tag.publicCode, configureUrl, lang }));
      await record(deps, req, tag, method, "inventory_scan");
      return;
    }

    // disabled / retired (or any unknown status): generic, no reason exposed.
    res.status(410).type("html").send(renderTagPage("unavailable", { lang }));
    await record(deps, req, tag, method, "disabled_scan");
  };
}
