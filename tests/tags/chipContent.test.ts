// What a piece hands out (shared/chipContent.ts): a link, an email, a phone or a
// contact card. These values end up on chips and behind printed QR codes, so a
// malformed one is expensive: the rules that build and validate them are pinned here.

import { describe, expect, it } from "vitest";
import {
  EMPTY_VCARD,
  buildMailto,
  buildTel,
  buildVCard,
  contentKindOf,
  contentSummary,
  isValidEmail,
  parseMailto,
  parseVCard,
  validateChipContent,
  vcardProblem,
} from "../../shared/chipContent.js";
import { resolveRedirectTarget } from "../../shared/tags.js";

const card = { ...EMPTY_VCARD, firstName: "Ana", lastName: "Souza", org: "Café; Bar, Ltda", title: "Owner", phone: "+15085550100", email: "Ana@Example.com", url: "https://cafe.example" };

describe("email", () => {
  it("accepts real addresses and refuses junk", () => {
    expect(isValidEmail("ana@example.com")).toBe(true);
    expect(isValidEmail("ana.souza+promo@mail.example.com.br")).toBe(true);
    for (const bad of ["", "ana", "ana@", "@example.com", "ana@example", "ana @example.com", "ana@exa mple.com", "a@b..com"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("builds a lowercase mailto: with an encoded subject, and reads it back", () => {
    const value = buildMailto(" Ana@Example.com ", "Orçamento & visita");
    expect(value).toBe("mailto:ana@example.com?subject=Or%C3%A7amento%20%26%20visita");
    expect(parseMailto(value)).toEqual({ email: "ana@example.com", subject: "Orçamento & visita" });
    expect(buildMailto("ana@example.com")).toBe("mailto:ana@example.com");
  });
});

describe("vCard", () => {
  it("writes vCard 3.0 with CRLF and escaped commas/semicolons", () => {
    const text = buildVCard(card);
    expect(text.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Souza;Ana;;;",
      "FN:Ana Souza",
      "ORG:Café\\; Bar\\, Ltda",
      "TITLE:Owner",
      "TEL;TYPE=CELL:+15085550100",
      "EMAIL;TYPE=INTERNET:ana@example.com",
      "URL:https://cafe.example",
      "END:VCARD",
    ]);
  });

  it("reads back what it writes", () => {
    expect(parseVCard(buildVCard(card))).toEqual({ ...card, email: "ana@example.com" });
  });

  it("needs a name and a way to reach the person", () => {
    expect(vcardProblem({ ...EMPTY_VCARD, phone: "+15085550100" })).toBe("vcardName");
    expect(vcardProblem({ ...EMPTY_VCARD, org: "Café" })).toBe("vcardReach");
    expect(vcardProblem({ ...EMPTY_VCARD, firstName: "Ana", phone: "5550100" })).toBe("vcardPhone");
    expect(vcardProblem({ ...EMPTY_VCARD, firstName: "Ana", email: "ana@" })).toBe("vcardEmail");
    expect(vcardProblem({ ...EMPTY_VCARD, firstName: "Ana", email: "ana@example.com", url: "javascript:alert(1)" })).toBe("vcardUrl");
    expect(vcardProblem({ ...EMPTY_VCARD, org: "Café", email: "ana@example.com" })).toBeNull();
  });
});

describe("validateChipContent", () => {
  it("recognises each kind", () => {
    expect(contentKindOf("https://x.com")).toBe("url");
    expect(contentKindOf("MAILTO:a@b.com")).toBe("email");
    expect(contentKindOf("tel:+15085550100")).toBe("phone");
    expect(contentKindOf(buildVCard(card))).toBe("vcard");
  });

  it("keeps links on the existing https-only rule", () => {
    expect(validateChipContent("https://cafe.example/menu")).toEqual({ ok: true, kind: "url", value: "https://cafe.example/menu" });
    expect(validateChipContent("javascript:alert(1)").ok).toBe(false);
    expect(validateChipContent("data:text/html,hi").ok).toBe(false);
  });

  it("canonicalises email, phone and vCard, and refuses broken ones", () => {
    expect(validateChipContent("mailto:Ana@Example.com")).toEqual({ ok: true, kind: "email", value: "mailto:ana@example.com" });
    expect(validateChipContent("mailto:not-an-email").ok).toBe(false);
    expect(validateChipContent(buildTel("+15085550100"))).toEqual({ ok: true, kind: "phone", value: "tel:+15085550100" });
    expect(validateChipContent("tel:5550100").ok).toBe(false);
    expect(validateChipContent(buildVCard(card).replace(/\r\n/g, "\n"))).toEqual({ ok: true, kind: "vcard", value: buildVCard({ ...card, email: "ana@example.com" }) });
    expect(validateChipContent("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana").ok).toBe(false);
    expect(validateChipContent(buildVCard({ ...EMPTY_VCARD, firstName: "Ana" })).ok).toBe(false);
  });

  it("summarises each kind for lists", () => {
    expect(contentSummary("mailto:ana@example.com?subject=Hi")).toBe("ana@example.com");
    expect(contentSummary("tel:+15085550100")).toBe("+15085550100");
    expect(contentSummary(buildVCard(card))).toBe("Ana Souza");
    expect(contentSummary("https://x.com")).toBe("https://x.com");
  });
});

describe("UTMs", () => {
  it("are only added to web links", () => {
    const tag = { utmEnabled: true, utmCampaign: "spring", publicCode: "A7K3P9X2" };
    expect(resolveRedirectTarget({ ...tag, destinationUrl: "https://cafe.example" }, "qr")).toContain("utm_source=xpot-tag");
    expect(resolveRedirectTarget({ ...tag, destinationUrl: "mailto:ana@example.com" }, "qr")).toBe("mailto:ana@example.com");
    expect(resolveRedirectTarget({ ...tag, destinationUrl: "tel:+15085550100" }, "nfc")).toBe("tel:+15085550100");
  });
});

describe("public scan of a live piece", () => {
  it("serves a contact card as a vCard download and an email as a page that opens it", async () => {
    const { createTagRedirectHandler } = await import("../../server/tags/publicHandler.js");
    const vcard = buildVCard(card);
    const serve = async (destinationUrl: string) => {
      const handler = createTagRedirectHandler("nfc", {
        findByCode: async () => ({ id: "t1", publicCode: "A7K3P9X2", leadId: 1, repId: 1, status: "active", destinationUrl, utmEnabled: true, utmCampaign: null }),
        recordEvent: async () => undefined,
        configureUrlFor: async () => undefined,
      } as never);
      const out: { status?: number; type?: string; body?: string; headers: Record<string, string>; location?: string } = { headers: {} };
      const res = {
        setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
        set: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; return res; },
        status: (s: number) => { out.status = s; return res; },
        type: (t: string) => { out.type = t; return res; },
        send: (b: string) => { out.body = b; return res; },
        redirect: (s: number, l: string) => { out.status = s; out.location = l; },
      };
      await handler({ params: { code: "A7K3P9X2" }, get: () => undefined, headers: {}, ip: "1.1.1.1", query: {} } as never, res as never, () => undefined);
      return out;
    };
    const v = await serve(vcard);
    expect(v.status).toBe(200);
    expect(v.type).toMatch(/text\/vcard/);
    expect(v.body).toBe(vcard);
    expect(v.headers["content-disposition"]).toContain("Ana-Souza.vcf");
    const e = await serve("mailto:ana@example.com");
    expect(e.status).toBe(200);
    expect(e.body).toContain('href="mailto:ana@example.com"');
    const l = await serve("https://cafe.example");
    expect(l.status).toBe(302);
    expect(l.location).toContain("https://cafe.example/?utm_source=xpot-tag");
  });
});
