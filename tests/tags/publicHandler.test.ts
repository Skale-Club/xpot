import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";
import type { InsertTagEvent } from "../../shared/schema.js";
import { createTagRedirectHandler, type PublicTag, type PublicTagDeps } from "../../server/tags/publicHandler.js";

const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function makeTag(overrides: Partial<PublicTag> = {}): PublicTag {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    publicCode: "A7K3P9X2",
    leadId: 22,
    repId: 7,
    status: "active",
    destinationUrl: "https://g.page/r/johns-barber/review",
    utmEnabled: false,
    utmCampaign: null,
    ...overrides,
  };
}

async function withServer(
  deps: Partial<PublicTagDeps> & { tags: Map<string, PublicTag> },
  fn: (ctx: { base: string; events: InsertTagEvent[]; settle: () => Promise<void> }) => Promise<void>,
) {
  const events: InsertTagEvent[] = [];
  const pending: Promise<unknown>[] = [];
  const full: PublicTagDeps = {
    findByCode: deps.findByCode ?? (async (code) => deps.tags.get(code) ?? null),
    recordEvent: deps.recordEvent ?? (async (e) => { events.push(e); }),
    configureUrlFor: deps.configureUrlFor ?? (async () => undefined),
  };
  const app = express();
  // Track each handler run so assertions can wait for the post-response event write.
  const wrap = (method: "qr" | "nfc") => {
    const handler = createTagRedirectHandler(method, full);
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      pending.push(Promise.resolve(handler(req, res, next)));
    };
  };
  app.get("/q/:code", wrap("qr"));
  app.get("/n/:code", wrap("nfc"));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await fn({ base: `http://127.0.0.1:${port}`, events, settle: () => Promise.all(pending).then(() => undefined) });
  } finally {
    server.close();
  }
}

const get = (url: string, init: RequestInit = {}) =>
  fetch(url, { redirect: "manual", ...init, headers: { "user-agent": PHONE_UA, ...(init.headers ?? {}) } });

test("active QR → 302 to the destination, no-store, and a qr event", async () => {
  await withServer({ tags: new Map([["A7K3P9X2", makeTag()]]) }, async ({ base, events, settle }) => {
    const res = await get(`${base}/q/A7K3P9X2`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://g.page/r/johns-barber/review");
    assert.equal(res.headers.get("cache-control"), "no-store");
    await settle();
    assert.equal(events.length, 1);
    assert.equal(events[0].accessMethod, "qr");
    assert.equal(events[0].eventType, "redirect");
    assert.equal(events[0].tagId, makeTag().id);
    assert.equal(events[0].leadId, makeTag().leadId);
    assert.equal(events[0].repId, makeTag().repId);
    assert.equal(events[0].isBot, false);
    assert.equal(events[0].deviceType, "mobile");
    assert.ok(events[0].visitorDayKey);
    // No raw IP anywhere in the stored event.
    assert.ok(!JSON.stringify(events[0]).includes("127.0.0.1"));
  });
});

test("active NFC → same destination, recorded as nfc; lowercase code works", async () => {
  await withServer({ tags: new Map([["A7K3P9X2", makeTag()]]) }, async ({ base, events, settle }) => {
    const res = await get(`${base}/n/a7k3p9x2`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://g.page/r/johns-barber/review");
    await settle();
    assert.equal(events[0].accessMethod, "nfc");
  });
});

test("changing the destination takes effect on the same physical URL", async () => {
  const tags = new Map([["A7K3P9X2", makeTag()]]);
  await withServer({ tags }, async ({ base }) => {
    assert.equal((await get(`${base}/q/A7K3P9X2`)).headers.get("location"), "https://g.page/r/johns-barber/review");
    tags.set("A7K3P9X2", makeTag({ destinationUrl: "https://johnsbarber.com/book" }));
    assert.equal((await get(`${base}/q/A7K3P9X2`)).headers.get("location"), "https://johnsbarber.com/book");
    assert.equal((await get(`${base}/n/A7K3P9X2`)).headers.get("location"), "https://johnsbarber.com/book");
  });
});

test("UTMs carry the access method when enabled", async () => {
  const tags = new Map([["A7K3P9X2", makeTag({ destinationUrl: "https://site.com/?x=1", utmEnabled: true, utmCampaign: "Johns" })]]);
  await withServer({ tags }, async ({ base }) => {
    const qr = new URL((await get(`${base}/q/A7K3P9X2`)).headers.get("location")!);
    const nfc = new URL((await get(`${base}/n/A7K3P9X2`)).headers.get("location")!);
    assert.equal(qr.searchParams.get("x"), "1");
    assert.equal(qr.searchParams.get("utm_medium"), "qr");
    assert.equal(nfc.searchParams.get("utm_medium"), "nfc");
    assert.equal(nfc.searchParams.get("utm_content"), "A7K3P9X2");
  });
});

test("analytics failure never blocks a valid redirect", async () => {
  await withServer(
    { tags: new Map([["A7K3P9X2", makeTag()]]), recordEvent: async () => { throw new Error("db down"); } },
    async ({ base, settle }) => {
      const res = await get(`${base}/q/A7K3P9X2`);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), "https://g.page/r/johns-barber/review");
      await settle();
    },
  );
});

test("unknown and malformed codes get a safe 404 page", async () => {
  await withServer({ tags: new Map() }, async ({ base, events, settle }) => {
    for (const path of ["/q/ZZZZZZZZ", "/n/not-a-code", "/q/%3Cscript%3E"]) {
      const res = await get(`${base}${path}`);
      assert.equal(res.status, 404, path);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.match(await res.text(), /We could not find this Xpot/);
    }
    await settle();
    assert.equal(events.length, 0);
  });
});

test("inventory tag shows the activation page, never a destination", async () => {
  const tags = new Map([["A7K3P9X2", makeTag({ status: "inventory", leadId: null, destinationUrl: null })]]);
  await withServer({ tags }, async ({ base, events, settle }) => {
    const res = await get(`${base}/q/A7K3P9X2`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /ready to come alive/);
    assert.match(html, /Discover Xpot/);
    assert.doesNotMatch(html, /Activate this piece/);
    await settle();
    assert.equal(events[0].eventType, "inventory_scan");
  });
});

test("admins scanning an unassigned tag get a configure shortcut", async () => {
  const tags = new Map([["A7K3P9X2", makeTag({ status: "inventory", leadId: null, destinationUrl: null })]]);
  await withServer({ tags, configureUrlFor: async () => "/tags/t/A7K3P9X2" }, async ({ base }) => {
    const html = await (await get(`${base}/q/A7K3P9X2`)).text();
    assert.match(html, /href="\/tags\/t\/A7K3P9X2"/);
    assert.match(html, /Activate this piece/);
  });
});

test("assigned tag has reassuring setup-in-progress copy", async () => {
  const tags = new Map([["A7K3P9X2", makeTag({ status: "assigned", destinationUrl: null })]]);
  await withServer({ tags }, async ({ base }) => {
    const res = await get(`${base}/q/A7K3P9X2`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /experience is almost ready/);
  });
});

test("disabled and retired tags show a generic unavailable page with no customer data", async () => {
  for (const status of ["disabled", "retired"]) {
    const tags = new Map([["A7K3P9X2", makeTag({ status })]]);
    await withServer({ tags }, async ({ base, events, settle }) => {
      const res = await get(`${base}/q/A7K3P9X2`);
      assert.equal(res.status, 410);
      const html = await res.text();
      assert.match(html, /not available/);
      assert.doesNotMatch(html, /johns-barber|disabled|retired/i);
      await settle();
      assert.equal(events[0].eventType, "disabled_scan");
    });
  }
});

test("an active tag with a bad stored destination never redirects", async () => {
  const tags = new Map([["A7K3P9X2", makeTag({ destinationUrl: "javascript:alert(1)" })]]);
  await withServer({ tags }, async ({ base, events, settle }) => {
    const res = await get(`${base}/q/A7K3P9X2`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("location"), null);
    await settle();
    assert.equal(events[0].eventType, "misconfigured_scan");
  });
});

test("a failed lookup answers a generic page instead of a stack trace", async () => {
  await withServer({ tags: new Map(), findByCode: async () => { throw new Error("connection refused at 10.0.0.5"); } }, async ({ base }) => {
    const res = await get(`${base}/q/A7K3P9X2`);
    assert.equal(res.status, 503);
    assert.doesNotMatch(await res.text(), /10\.0\.0\.5|connection refused/);
  });
});

test("HEAD requests redirect but are not counted; bots are flagged", async () => {
  await withServer({ tags: new Map([["A7K3P9X2", makeTag()]]) }, async ({ base, events, settle }) => {
    const head = await get(`${base}/q/A7K3P9X2`, { method: "HEAD" });
    assert.equal(head.status, 302);
    await settle();
    assert.equal(events.length, 0);
    const bot = await get(`${base}/q/A7K3P9X2`, { headers: { "user-agent": "facebookexternalhit/1.1" } });
    assert.equal(bot.status, 302);
    await settle();
    assert.equal(events.length, 1);
    assert.equal(events[0].isBot, true);
  });
});
