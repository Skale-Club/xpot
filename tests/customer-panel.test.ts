// The customer panel's pure rules (shared/customerPanel.ts) and the small helpers of the /my screens.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_SESSION_MAX_MS,
  customerAccessFor,
  customerPanelEnabled,
  customerSessionLeadIds,
  whatsappLinkFor,
} from "../shared/customerPanel";
import { cleanPlateCode, plateCodeReady, relativeTime } from "../client/src/pages/my/format";

describe("customerPanelEnabled", () => {
  it("is off unless the server says so", () => {
    expect(customerPanelEnabled({})).toBe(false);
    expect(customerPanelEnabled({ CUSTOMER_PANEL_ENABLED: "" })).toBe(false);
    expect(customerPanelEnabled({ CUSTOMER_PANEL_ENABLED: "0" })).toBe(false);
    expect(customerPanelEnabled({ CUSTOMER_PANEL_ENABLED: "false" })).toBe(false);
    expect(customerPanelEnabled({ CUSTOMER_PANEL_ENABLED: "maybe" })).toBe(false);
  });

  it("is on for the usual true-ish words", () => {
    for (const value of ["1", "true", "TRUE", " on ", "yes"]) expect(customerPanelEnabled({ CUSTOMER_PANEL_ENABLED: value })).toBe(true);
  });
});

describe("customerAccessFor", () => {
  const A = "+15550130001";
  const B = "+15550130002";

  it("lets in a phone a seller added", () => {
    expect(customerAccessFor(A, [A, B], null)).toBe("contact");
  });

  it("lets in the business's own phone", () => {
    expect(customerAccessFor(A, [], A)).toBe("business_phone");
  });

  it("names the seller's list when both are true", () => {
    expect(customerAccessFor(A, [A], A)).toBe("contact");
  });

  it("refuses everyone else", () => {
    expect(customerAccessFor(A, [B], B)).toBeNull();
    expect(customerAccessFor(A, [], null)).toBeNull();
  });
});

describe("customerSessionLeadIds", () => {
  const now = 1_800_000_000_000;
  const session = { customerPhone: "+15550130001", customerLeadIds: [4, 9], customerAt: now - 1000 };

  it("gives the leads of a fresh customer session", () => {
    expect(customerSessionLeadIds(session, now)).toEqual([4, 9]);
  });

  it("gives nothing without a customer session, such as a team session", () => {
    expect(customerSessionLeadIds(undefined, now)).toBeNull();
    expect(customerSessionLeadIds({}, now)).toBeNull();
    expect(customerSessionLeadIds({ ...session, customerPhone: undefined }, now)).toBeNull();
    expect(customerSessionLeadIds({ ...session, customerLeadIds: [] }, now)).toBeNull();
    expect(customerSessionLeadIds({ ...session, customerAt: undefined }, now)).toBeNull();
  });

  it("expires after 30 days", () => {
    expect(customerSessionLeadIds({ ...session, customerAt: now - CUSTOMER_SESSION_MAX_MS }, now)).toEqual([4, 9]);
    expect(customerSessionLeadIds({ ...session, customerAt: now - CUSTOMER_SESSION_MAX_MS - 1 }, now)).toBeNull();
  });
});

describe("whatsappLinkFor", () => {
  it("opens a chat with the digits of the phone", () => {
    expect(whatsappLinkFor("+15085550100")).toBe("https://wa.me/15085550100");
  });

  it("gives nothing for an empty or impossible number", () => {
    expect(whatsappLinkFor(null)).toBeNull();
    expect(whatsappLinkFor("")).toBeNull();
    expect(whatsappLinkFor("123")).toBeNull();
    expect(whatsappLinkFor("+1234567890123456789")).toBeNull();
  });
});

describe("the plate code field", () => {
  it("keeps what a person types readable and short", () => {
    expect(cleanPlateCode("7k4m-9x2p")).toBe("7K4M-9X2P");
    expect(cleanPlateCode("7k4m 9x2p!!")).toBe("7K4M 9X2P");
    expect(cleanPlateCode("A".repeat(40))).toHaveLength(14);
  });

  it("is ready at 8 to 10 characters, separators aside", () => {
    expect(plateCodeReady("7K4M-9X2P")).toBe(true);
    expect(plateCodeReady("7K4M-9X2")).toBe(false);
    expect(plateCodeReady("7K4M9X2PAB")).toBe(true);
    expect(plateCodeReady("7K4M9X2PABC")).toBe(false);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");

  it("writes the largest unit that fits, in the language asked", () => {
    expect(relativeTime("2026-11-01T10:00:00Z", now, "en-US")).toBe("2 hours ago");
    expect(relativeTime("2026-10-30T12:00:00Z", now, "en-US")).toBe("2 days ago");
    expect(relativeTime("2026-10-30T12:00:00Z", now, "pt-BR")).toBe("anteontem");
    expect(relativeTime("2026-11-01T11:30:00Z", now, "en-US")).toBe("30 minutes ago");
  });

  it("says nothing for a date it cannot read", () => {
    expect(relativeTime("not a date", now, "en-US")).toBe("");
  });
});

describe("robots", () => {
  it("keeps search engines out of /my", () => {
    const robots = fs.readFileSync(path.join(import.meta.dirname, "..", "client", "public", "robots.txt"), "utf8");
    expect(robots).toMatch(/^Disallow: \/my\r?$/m);
  });
});
