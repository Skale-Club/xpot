// The rules behind the reorganised platform screens: which tab of Brand &
// public site a URL opens, where Status sends someone to fix a service, and
// what the Status banner blames.

import { describe, expect, it } from "vitest";
import { brandSiteTabFrom, brandSiteTabHref, readableOn } from "../client/src/pages/admin/platform/brandSiteUi";
import {
  activeInChain,
  eventScreenPath,
  serviceAnchor,
  serviceHref,
  servicesNeedingAttention,
  statusOverview,
} from "../client/src/pages/admin/platform/servicesUi";
import type { ServiceStatus } from "../shared/integrations-registry";
import type { SystemHealthSnapshot } from "../shared/system-health";

const service = (over: Partial<ServiceStatus>): ServiceStatus => ({
  id: "twilio",
  job: "signIn",
  status: "live",
  source: "panel",
  active: false,
  variant: null,
  count: null,
  lastTest: null,
  lastSuccessAt: null,
  lastError: null,
  ...over,
});

const snapshot = (over: { overall?: SystemHealthSnapshot["overall"]; worker?: Partial<SystemHealthSnapshot["worker"]>; queue?: Partial<SystemHealthSnapshot["queue"]> } = {}) =>
  ({
    overall: over.overall ?? "healthy",
    worker: { verdict: "healthy", ...over.worker },
    queue: { activeRuns: [], stuckJobs: [], ...over.queue },
  }) as unknown as Pick<SystemHealthSnapshot, "overall" | "worker" | "queue">;

describe("Brand & public site tabs", () => {
  it("opens Identity on /admin/branding, the installed app with ?tab=app, the editor on /admin/landing", () => {
    expect(brandSiteTabFrom("/admin/branding")).toBe("identity");
    expect(brandSiteTabFrom("/admin/branding/", "")).toBe("identity");
    expect(brandSiteTabFrom("/admin/branding", "?tab=app")).toBe("app");
    expect(brandSiteTabFrom("/admin/branding", "tab=nope")).toBe("identity");
    expect(brandSiteTabFrom("/admin/landing")).toBe("landing");
    expect(brandSiteTabFrom("/admin/landing", "?tab=app")).toBe("landing");
  });

  it("writes each tab's URL so the old links keep working", () => {
    expect(brandSiteTabHref("identity")).toBe("/admin/branding");
    expect(brandSiteTabHref("app")).toBe("/admin/branding?tab=app");
    expect(brandSiteTabHref("landing")).toBe("/admin/landing");
  });

  it("picks a readable text colour for the opening-screen preview", () => {
    expect(readableOn("#0a0f1e")).toBe("#ffffff");
    expect(readableOn("#ffffff")).toBe("#0b1020");
    expect(readableOn("#FACC15")).toBe("#0b1020");
    expect(readableOn("not a colour")).toBe("#ffffff");
  });
});

describe("services on Integrations and Status", () => {
  it("link a Status row to its Integrations card", () => {
    expect(serviceAnchor("gohighlevel")).toBe("service-gohighlevel");
    expect(serviceHref("twilio")).toBe("/admin/integrations#service-twilio");
  });

  it("list only the incomplete ones as needing attention, and name the one doing a job", () => {
    const rows = [service({ id: "twilio", status: "broken" }), service({ id: "groq", status: "idle" }), service({ id: "openai", active: true })];
    expect(servicesNeedingAttention(rows).map((s) => s.id)).toEqual(["twilio"]);
    expect(activeInChain(rows, ["groq", "openai"])?.id).toBe("openai");
    expect(activeInChain(rows, ["openrouter", "gemini"])).toBeNull();
  });
});

describe("the Status banner", () => {
  it("is all normal when nothing needs a look", () => {
    expect(statusOverview(snapshot(), [service({})], 0)).toEqual({ verdict: "healthy", causes: [] });
  });

  it("blames an incomplete service and records stuck on the way to the CRM, worst first", () => {
    const result = statusOverview(snapshot(), [service({ status: "broken" })], 3);
    expect(result).toEqual({ verdict: "down", causes: ["services", "sync"] });
  });

  it("keeps the pipeline's own verdict and names the worker or the stuck routes behind it", () => {
    expect(statusOverview(snapshot({ overall: "down", worker: { verdict: "down" } }), [], 0)).toEqual({ verdict: "down", causes: ["worker"] });
    const stuck = snapshot({ overall: "stalled", queue: { stuckJobs: [{} as never] } });
    expect(statusOverview(stuck, [], 1)).toEqual({ verdict: "stalled", causes: ["stuck", "sync"] });
  });

  it("CRM sync problems alone read as slower than usual, not down", () => {
    expect(statusOverview(snapshot(), [], 2).verdict).toBe("slow");
  });
});

describe("event detail", () => {
  it("names the screen an event happened on, without the host or query", () => {
    expect(eventScreenPath("https://xpot.place/leads/12?tab=visits")).toBe("/leads/12");
    expect(eventScreenPath("/dashboard")).toBe("/dashboard");
    expect(eventScreenPath(null)).toBeNull();
    expect(eventScreenPath("")).toBeNull();
  });
});
