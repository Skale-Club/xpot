// Server errors a person can hit in normal flows (kits, returns, intake, sales,
// check-in, companies) carry a stable `code`; the client words it in the user's
// language (srv_<code> in client/src/i18n/messages/apiErrors.ts) and falls back
// to the server's English sentence for a code it does not know.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const lang = vi.hoisted(() => ({ current: "en" as "en" | "pt" | "es" }));
vi.mock("../client/src/i18n", () => ({
  translate: (dict: Record<string, Record<string, string>>, key: string, vars?: Record<string, string | number>) =>
    (dict[lang.current][key] ?? dict.en[key] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`)),
}));

import { serverErrorText } from "../client/src/lib/apiErrors";
import { apiErrorMessages } from "../client/src/i18n/messages/apiErrors";
import { TagError, tagErrorBody } from "../server/tags/errors";
import { planTransition, TAG_ACTIONS } from "../shared/tags";

const translated = new Set(Object.keys(apiErrorMessages.en).filter((k) => k.startsWith("srv_")).map((k) => k.slice(4)));

describe("serverErrorText", () => {
  it("words a known code in the language in use, with its params", () => {
    const body = { message: "Not in house stock: A7K3P9X2", code: "tag_not_house_stock", params: { codes: "A7K3P9X2" } };
    lang.current = "en";
    expect(serverErrorText(body, "x")).toBe("Not in house stock: A7K3P9X2");
    lang.current = "pt";
    expect(serverErrorText(body, "x")).toBe("Fora do estoque da casa: A7K3P9X2");
    lang.current = "es";
    expect(serverErrorText(body, "x")).toBe("Fuera del stock de la casa: A7K3P9X2");
    lang.current = "en";
  });

  it("keeps the server's sentence for an unknown code, and the fallback without one", () => {
    expect(serverErrorText({ message: "Something new", code: "brand_new_code" }, "Request failed")).toBe("Something new");
    expect(serverErrorText({ message: "Plain" }, "Request failed")).toBe("Plain");
    expect(serverErrorText({}, "Request failed")).toBe("Request failed");
    expect(serverErrorText(null, "Request failed")).toBe("Request failed");
  });

  it("sends TagError's code and params in the body", () => {
    const err = new TagError("Piece X already belongs to another batch", 409, "piece_other_batch", { code: "X" });
    expect(tagErrorBody(err)).toEqual({ message: err.message, code: "piece_other_batch", params: { code: "X" } });
    expect(tagErrorBody(new TagError("Plain", 400))).toEqual({ message: "Plain" });
  });
});

describe("every code the server sends from these flows has a translation", () => {
  const sources = [
    ...readdirSync(join(__dirname, "../server/tags")).filter((f) => f.endsWith(".ts")).map((f) => join(__dirname, "../server/tags", f)),
    ...["visits.ts", "leads.ts", "consignments.ts", "sales.ts", "visit-actions.ts"].map((f) => join(__dirname, "../server/routes/xpot", f)),
  ];
  const codes = new Set<string>();
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    // new TagError(message, status, "code"…)
    for (const m of text.matchAll(/new TagError\([^;]*?,\s*\d{3},\s*"(\w+)"/g)) codes.add(m[1]);
    // res.status(4xx).json({ code: "…", message
    for (const m of text.matchAll(/json\(\{ code: "(\w+)", message/g)) codes.add(m[1]);
  }
  // The sale and wholesale-order refusals a reseller or manager can reach from the screens.
  for (const code of ["tag_already_sold", "tag_product_mismatch", "tag_owner_mismatch", "tag_retired", "tag_not_available", "tag_lead_mismatch", "tag_cost_missing", "seller_cost_policy_unconfigured", "lead_forbidden", "partial_payment_invalid", "tag_not_house_stock", "acquisition_quantity_mismatch"]) codes.add(code);

  it("finds the codes", () => {
    expect(codes.size).toBeGreaterThan(30);
  });

  it("translates them all", () => {
    // validation_error carries Zod field errors, worded through err_<code>.
    expect([...codes].filter((c) => c !== "validation_error" && !translated.has(c))).toEqual([]);
  });

  it("gives every lifecycle refusal a translated code", () => {
    const tags = [
      { status: "inventory", leadId: null, destinationUrl: null, destinationType: null },
      { status: "assigned", leadId: 1, destinationUrl: null, destinationType: null },
      { status: "active", leadId: 1, destinationUrl: "https://x.test", destinationType: "website" },
      { status: "retired", leadId: null, destinationUrl: null, destinationType: null },
      { status: "inventory", leadId: null, destinationUrl: null, destinationType: null, stockStatus: "pending" },
      { status: "inventory", leadId: null, destinationUrl: null, destinationType: null, stockStatus: "damaged" },
    ];
    const missing: string[] = [];
    for (const tag of tags) {
      for (const action of TAG_ACTIONS) {
        const plan = planTransition(tag, action);
        if (!plan.ok && !translated.has(plan.code)) missing.push(`${action} on ${tag.status}: ${plan.code}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
