// The hand-off ticket that opens wholesale on Stuscle: signed byte for byte the way Stuscle verifies it, and minted
// only by Xpot's open route, for the signed-in rep's own code. A link the app renders carries no code, so a copied or
// forwarded one opens nothing for anyone else.
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HANDOFF_TTL_SECONDS, parseHandoffItems, parseHandoffQuery, signWholesaleHandoff } from "../server/wholesale/handoff";
import { WHOLESALE_OPEN_PATH } from "../shared/wholesale";

// The open route's world, without a database: who is signed in (x-test-user), their code, their partner's distribution.
const REP_CODE = "XPABCD1234";
const reps: Record<string, { id: number; isActive: boolean; blockedAt: Date | null; role: string; modules: string[] }> = {
  ana: { id: 7, isActive: true, blockedAt: null, role: "rep", modules: ["tags"] },
  visits: { id: 8, isActive: true, blockedAt: null, role: "rep", modules: ["visits"] },
  pending: { id: 9, isActive: false, blockedAt: null, role: "rep", modules: ["tags"] },
  own: { id: 10, isActive: true, blockedAt: null, role: "rep", modules: ["tags"] },
};
vi.mock("../server/db.js", () => {
  const chain = { from: () => chain, where: () => chain, limit: async () => [{ code: REP_CODE }] };
  return { db: { select: () => chain }, pool: {} };
});
vi.mock("../server/routes/xpot/middleware.js", () => ({
  ensureXpotRep: async (req: any) => {
    const name = req.get("x-test-user");
    return name && reps[name] ? { user: { userId: name, isAdmin: false }, rep: reps[name] } : null;
  },
  accessDenial: (rep: { isActive: boolean; blockedAt?: Date | null }) => (rep.blockedAt ? { code: "blocked", message: "off" } : rep.isActive ? null : { code: "pending", message: "pending" }),
  isPlatformAdmin: (actor: any) => actor.user.isAdmin,
  requirePlatformAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../server/organizations/links.js", () => ({
  distributionForRep: async (repId: number) =>
    repId === reps.own.id ? { path: { receivesOrdersVia: "partner" }, partner: { name: "PD Brasil" } } : { path: { receivesOrdersVia: "stuscle" }, partner: null },
}));
vi.mock("../server/tags/distribution.js", () => ({ ordersReachXpot: (path: { receivesOrdersVia: string }) => path.receivesOrdersVia === "stuscle" }));
vi.mock("../server/tags/acquisitions.js", () => ({ recordStuscleOrder: async () => ({}) }));
vi.mock("../server/tags/sales.js", () => ({ TagSaleError: class TagSaleError extends Error {} }));

const SECRET = "test-secret-0123456789abcdef";

describe("signWholesaleHandoff", () => {
  it("reproduces Stuscle's test vector byte for byte", () => {
    const ticket = signWholesaleHandoff({ code: "XP-ABCD-1234", items: "NFC-STAND-IG-WHITE-S:5" }, SECRET, 1_794_000_000_000, "abcdefghijklmnop0123");
    expect(ticket).toBe(
      "h1.eyJjb2RlIjoiWFAtQUJDRC0xMjM0IiwiaXRlbXMiOiJORkMtU1RBTkQtSUctV0hJVEUtUzo1IiwiaWF0IjoxNzk0MDAwMDAwLCJleHAiOjE3OTQwMDAxMjAsImp0aSI6ImFiY2RlZmdoaWprbG1ub3AwMTIzIn0.J2so_aBInxIx2b9qq7_qAOFm4LecbO0JgsDenSg8q00",
    );
  });

  it("signs the code as XP-ABCD-1234 however it is stored, in the fixed order, leaving absent fields out", () => {
    const ticket = signWholesaleHandoff({ code: "XPABCD1234", product: "google-stand", lang: "pt-BR" }, SECRET, 1_794_000_000_500, "abcdefghijklmnop0123");
    const payload = JSON.parse(Buffer.from(ticket.split(".")[1], "base64url").toString());
    expect(Object.keys(payload)).toEqual(["code", "product", "lang", "iat", "exp", "jti"]);
    expect(payload).toMatchObject({ code: "XP-ABCD-1234", iat: 1_794_000_000, exp: 1_794_000_000 + HANDOFF_TTL_SECONDS });
  });

  it("gives every ticket its own random jti", () => {
    const jtis = new Set(Array.from({ length: 20 }, () => JSON.parse(Buffer.from(signWholesaleHandoff({ code: REP_CODE }, SECRET).split(".")[1], "base64url").toString()).jti));
    expect(jtis.size).toBe(20);
    for (const jti of jtis) expect(jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a short secret or something that is not a code", () => {
    expect(() => signWholesaleHandoff({ code: REP_CODE }, "short")).toThrow();
    expect(() => signWholesaleHandoff({ code: "hello" }, SECRET)).toThrow();
  });
});

describe("what a ticket may carry", () => {
  it("keeps the Shop's SKU:qty lists and refuses anything else", () => {
    expect(parseHandoffItems("NFC-STAND-IG-WHITE-S:5,KEYCHAIN-NFC:24")).toBe("NFC-STAND-IG-WHITE-S:5,KEYCHAIN-NFC:24");
    for (const junk of ["", "A", "A:0", "A:10001", "A:1.5", "A:-1", "A B:1", "A:1,a:2", "A:1,", "<x>:1", `${"A".repeat(121)}:1`, Array.from({ length: 21 }, (_, i) => `S${i}:1`).join(",")]) {
      expect(parseHandoffItems(junk), junk).toBeNull();
    }
  });

  it("reads items, product and lang, ignores a code and anything unknown, and refuses junk or repeats", () => {
    expect(parseHandoffQuery({ items: "A:2", product: "google-stand", lang: "es", code: "XP-ZZZZ-ZZZZ", utm: "x" })).toEqual({ items: "A:2", product: "google-stand", lang: "es" });
    expect(parseHandoffQuery({})).toEqual({});
    for (const bad of [{ product: "Google Stand" }, { product: "../x" }, { lang: "fr" }, { lang: "pt" }, { items: ["A:1", "B:1"] }, { product: "a".repeat(201) }]) {
      expect(parseHandoffQuery(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe(`GET ${WHOLESALE_OPEN_PATH}`, () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const { registerWholesaleRoutes } = await import("../server/wholesale/index");
    const app = express();
    app.use(express.json());
    registerWholesaleRoutes(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server?.close());
  beforeEach(() => {
    process.env.XPOT_WHOLESALE_SECRET = SECRET;
    process.env.STUSCLE_PUBLIC_URL = "https://stuscle.test/";
  });

  const open = (query: string, user: string | null, headers: Record<string, string> = {}) =>
    fetch(`${base}${WHOLESALE_OPEN_PATH}${query}`, {
      redirect: "manual",
      headers: { accept: "application/json", ...(user ? { "x-test-user": user } : {}), ...headers },
    });
  const ticketOf = (res: Response) => {
    const location = new URL(res.headers.get("location") ?? "");
    return { location, ticket: location.searchParams.get("ticket") ?? "" };
  };
  const payloadOf = (ticket: string) => JSON.parse(Buffer.from(ticket.split(".")[1], "base64url").toString());

  it("refuses anyone not signed in, and sends a browser tab through sign-in and back", async () => {
    expect((await open("?items=A:1", null)).status).toBe(401);
    const tab = await open("?items=A:1", null, { accept: "text/html", "sec-fetch-mode": "navigate" });
    expect(tab.status).toBe(303);
    expect(tab.headers.get("location")).toBe(`/?signin=1&next=${encodeURIComponent(`${WHOLESALE_OPEN_PATH}?items=A:1`)}`);
  });

  it("redirects the signed-in rep to the store with a ticket for their own code, and nothing else in the link", async () => {
    const res = await open("?items=NFC-STAND-IG-WHITE-S:5&lang=pt-BR", "ana");
    expect(res.status).toBe(303);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const { location, ticket } = ticketOf(res);
    expect(location.origin + location.pathname).toBe("https://stuscle.test/wholesale/kit");
    expect([...location.searchParams.keys()]).toEqual(["ticket"]);
    expect(location.toString()).not.toMatch(/code=|XP-ABCD/);
    // Signed with the shared secret, the way Stuscle checks it.
    const [version, body, signature] = ticket.split(".");
    expect(version).toBe("h1");
    expect(signature).toBe(createHmac("sha256", SECRET).update(`${version}.${body}`).digest("base64url"));
    const payload = payloadOf(ticket);
    expect(payload).toMatchObject({ code: "XP-ABCD-1234", items: "NFC-STAND-IG-WHITE-S:5", lang: "pt-BR" });
    expect(payload.exp - payload.iat).toBe(HANDOFF_TTL_SECONDS);
    expect(Math.abs(payload.iat - Date.now() / 1000)).toBeLessThan(5);
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/);
    expect("product" in payload).toBe(false);
  });

  it("carries a product handle, and with nothing asked opens the catalogue", async () => {
    expect(payloadOf(ticketOf(await open("?product=google-stand", "ana")).ticket)).toMatchObject({ product: "google-stand" });
    const plain = payloadOf(ticketOf(await open("", "ana")).ticket);
    expect(Object.keys(plain)).toEqual(["code", "iat", "exp", "jti"]);
  });

  it("ignores a code in the query: the ticket is always the signed-in rep's", async () => {
    const res = await open("?code=XP-ZZZZ-ZZZZ&items=A:1", "ana");
    expect(res.status).toBe(303);
    const { location, ticket } = ticketOf(res);
    expect(payloadOf(ticket).code).toBe("XP-ABCD-1234");
    expect(location.toString()).not.toContain("ZZZZ");
  });

  it("mints a new ticket on every click", async () => {
    const a = ticketOf(await open("?items=A:1", "ana")).ticket;
    const b = ticketOf(await open("?items=A:1", "ana")).ticket;
    expect(a).not.toBe(b);
  });

  it("refuses junk in the query with a 400", async () => {
    for (const query of ["?items=A:0", "?items=A:1&items=B:1", "?product=Not%20A%20Handle", "?lang=fr", "?items=A,B"]) {
      expect((await open(query, "ana")).status, query).toBe(400);
    }
  });

  it("refuses who may not buy at wholesale, and a bounce from another site", async () => {
    expect((await open("", "visits")).status).toBe(403);
    expect((await open("", "pending")).status).toBe(403);
    const own = await open("", "own");
    expect(own.status).toBe(403);
    expect(own.headers.get("location")).toBeNull();
    expect((await open("", "ana", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await open("", "ana", { "sec-fetch-site": "same-origin" })).status).toBe(303);
  });

  it("answers 503 without a secret long enough to sign with", async () => {
    delete process.env.XPOT_WHOLESALE_SECRET;
    expect((await open("", "ana")).status).toBe(503);
    process.env.XPOT_WHOLESALE_SECRET = "too-short";
    expect((await open("", "ana")).status).toBe(503);
  });

  it("the card's link is the open route: the code is shown, never linked", async () => {
    const res = await fetch(`${base}/api/xpot/wholesale`, { headers: { "x-test-user": "ana" } });
    expect(await res.json()).toEqual({ code: "XP-ABCD-1234", url: WHOLESALE_OPEN_PATH });
  });
});
