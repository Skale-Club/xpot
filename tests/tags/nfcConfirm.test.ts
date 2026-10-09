// A tap on /n/<code> proves the chip holds that link: the only way to check a
// chip written on an iPhone with NFC Tools. QR scans and bots must not count.

import { describe, expect, it } from "vitest";
import { createTagRedirectHandler } from "../../server/tags/publicHandler.js";
import type { TagAccessMethod } from "../../shared/tags.js";

async function scan(method: TagAccessMethod, userAgent: string, ip: string) {
  const confirmed: string[] = [];
  const handler = createTagRedirectHandler(method, {
    findByCode: async () => ({ id: "tag-1", publicCode: "A7K3P9X2", leadId: 1, repId: 1, status: "active", destinationUrl: "https://cafe.example", utmEnabled: false, utmCampaign: null }),
    recordEvent: async () => undefined,
    confirmNfc: async (id: string) => {
      confirmed.push(id);
    },
    configureUrlFor: async () => undefined,
  } as never);
  const res = {
    setHeader: () => undefined,
    set: () => res,
    status: () => res,
    type: () => res,
    send: () => res,
    redirect: () => undefined,
  };
  const req = { method: "GET", params: { code: "A7K3P9X2" }, get: (h: string) => (h.toLowerCase() === "user-agent" ? userAgent : undefined), headers: { "user-agent": userAgent }, ip, query: {} };
  await handler(req as never, res as never, () => undefined);
  return confirmed;
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("confirming a chip by a real tap", () => {
  it("confirms on an NFC tap from a phone", async () => {
    expect(await scan("nfc", IPHONE, "10.0.0.1")).toEqual(["tag-1"]);
  });

  it("does not confirm on a QR scan or a bot", async () => {
    expect(await scan("qr", IPHONE, "10.0.0.2")).toEqual([]);
    expect(await scan("nfc", "Googlebot/2.1 (+http://www.google.com/bot.html)", "10.0.0.3")).toEqual([]);
  });
});
