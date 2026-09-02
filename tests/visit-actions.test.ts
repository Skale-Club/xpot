// The voice-capture contract.
//
// These pin the exact sentences from the field that the module has to
// understand — "deixei trinta chaveiros", "ele vendeu dez, recebi e estou
// repondo mais dez", "vendi um site de seiscentos dólares" — as the shapes the
// model must produce and the parser must accept. A model swap or a prompt edit
// that breaks one of these breaks a rep's day, silently, a month later.

import { describe, expect, it } from "vitest";
import {
  buildActionPrompt,
  describeAction,
  extractJson,
  parseActions,
  visitActionSchema,
  visitAnalysisSchema,
  type ActionContext,
  type SettlementAction,
} from "../shared/visit-actions.js";

const CONTEXT: ActionContext = {
  leadName: "Barbearia do Zé",
  products: [
    { id: 1, name: "3D Printed Keychain", kind: "physical", consignable: true, basePriceCents: 500, unitLabel: "unit" },
    { id: 2, name: "Landing Page Website", kind: "digital", consignable: false, basePriceCents: 49900, unitLabel: "project" },
  ],
  consignments: [
    { id: 7, productId: 1, productName: "3D Printed Keychain", quantityOnHand: 30, unitPriceCents: 500 },
  ],
};

describe("the prompt carries the state the model needs to be right", () => {
  const prompt = buildActionPrompt("deixei trinta chaveiros aqui", CONTEXT);

  it("names the shop, so the model is not guessing who it is about", () => {
    expect(prompt).toContain("Barbearia do Zé");
  });

  it("lists the catalog with ids and prices", () => {
    expect(prompt).toContain('id=1 "3D Printed Keychain"');
    expect(prompt).toContain("$5.00/unit");
    expect(prompt).toContain("consignable");
  });

  it("states what is already on this shop's shelf — the settlement baseline", () => {
    expect(prompt).toContain("consignmentId=7");
    expect(prompt).toContain("30 on the shelf at $5.00 each");
  });

  it("carries the transcript verbatim", () => {
    expect(prompt).toContain("deixei trinta chaveiros aqui");
  });

  it("tells the model not to re-propose what a previous recording already did", () => {
    const withExisting = buildActionPrompt("deixei trinta chaveiros", {
      ...CONTEXT,
      existing: [{ type: "deposit", summary: "Leave 30 × 3D Printed Keychain" }],
    });
    expect(withExisting).toContain("do NOT propose these again");
    expect(withExisting).toContain("Leave 30 × 3D Printed Keychain");
  });

  it("says nothing about consignment when the shop has none", () => {
    const empty = buildActionPrompt("olá", { ...CONTEXT, consignments: [] });
    expect(empty).toContain("nothing of ours is on their shelf");
  });
});

describe("extractJson survives how models actually answer", () => {
  it("reads a bare object", () => {
    expect(extractJson('{"summary":"ok","actions":[]}')).toEqual({ summary: "ok", actions: [] });
  });

  it("reads a fenced block", () => {
    expect(extractJson('```json\n{"summary":"ok","actions":[]}\n```')).toEqual({ summary: "ok", actions: [] });
  });

  it("reads an object buried in chatter", () => {
    expect(extractJson('Sure! Here you go:\n{"summary":"ok","actions":[]}\nHope that helps.')).toMatchObject({ summary: "ok" });
  });

  it("returns null rather than throwing on nonsense", () => {
    expect(extractJson("I could not parse that")).toBeNull();
    expect(extractJson("{not json at all}")).toBeNull();
    expect(extractJson(null)).toBeNull();
  });
});

describe("the four things a rep says in the field", () => {
  it('"deixei trinta chaveiros aqui" — a deposit', () => {
    const [action] = parseActions([{
      type: "deposit", productId: 1, productName: "3D Printed Keychain",
      quantity: 30, unitPriceCents: 500, evidence: "deixei trinta chaveiros aqui", confidence: 0.95,
    }]);
    expect(action).toMatchObject({ type: "deposit", productId: 1, quantity: 30 });
    expect(describeAction(action)).toBe("Leave 30 × 3D Printed Keychain at $5.00");
  });

  it('"ele vendeu dez, recebi e estou repondo mais dez" — a settlement with restock', () => {
    const [action] = parseActions([{
      type: "settlement", consignmentId: 7, productId: 1, productName: "3D Printed Keychain",
      soldQuantity: 10, restockQuantity: 10, paid: true,
      evidence: "ele vendeu dez, recebi pelos dez e estou repondo mais dez", confidence: 0.9,
    }]) as SettlementAction[];
    expect(action).toMatchObject({ type: "settlement", consignmentId: 7, soldQuantity: 10, restockQuantity: 10, paid: true });
    expect(describeAction(action)).toBe("Settle 3D Printed Keychain — 10 sold, restock 10");
  });

  it('"sobraram só quatro na prateleira" — the same settlement said the other way', () => {
    const [action] = parseActions([{
      type: "settlement", consignmentId: 7, countedRemaining: 4, evidence: "sobraram só quatro",
    }]) as SettlementAction[];
    expect(action.countedRemaining).toBe(4);
    expect(action.soldQuantity).toBeUndefined();
  });

  it('"vendi um site de seiscentos dólares" — a direct sale in cents', () => {
    const [action] = parseActions([{
      type: "sale",
      items: [{ productId: null, description: "site", quantity: 1, unitPriceCents: 60000 }],
      paid: true, evidence: "vendi um site de seiscentos dólares pra ele", confidence: 0.92,
    }]);
    expect(describeAction(action)).toBe("Sell 1× site — $600.00");
  });

  it('"quer saber mais sobre o site, voltar semana que vem" — a follow-up', () => {
    const [action] = parseActions([{
      type: "follow_up", title: "Come back about the site", interest: "site", inDays: 7,
      evidence: "ele gostaria de saber mais sobre o site, pediu pra eu voltar semana que vem",
    }]);
    expect(action).toMatchObject({ type: "follow_up", inDays: 7, interest: "site" });
    expect(describeAction(action)).toBe("Come back about the site (in 7d)");
  });

  it('"não tinha ninguém" — no actions at all, and that is correct', () => {
    expect(parseActions([])).toHaveLength(0);
  });
});

describe("the contract refuses what it cannot trust", () => {
  it("drops a settlement that says neither how many sold nor how many are left", () => {
    expect(parseActions([{ type: "settlement", consignmentId: 7, restockQuantity: 10 }])).toHaveLength(0);
  });

  it("drops a deposit with no quantity — inventing one would become a real bill", () => {
    expect(parseActions([{ type: "deposit", productId: 1, productName: "Keychain" }])).toHaveLength(0);
    expect(parseActions([{ type: "deposit", productId: 1, quantity: 0 }])).toHaveLength(0);
    expect(parseActions([{ type: "deposit", productId: 1, quantity: -5 }])).toHaveLength(0);
  });

  it("drops a sale with no items, and an unknown action type", () => {
    expect(parseActions([{ type: "sale", items: [] }])).toHaveLength(0);
    expect(parseActions([{ type: "refund", amount: 100 }])).toHaveLength(0);
  });

  it("keeps the good actions when one in the batch is malformed", () => {
    const actions = parseActions([
      { type: "deposit", productId: 1, quantity: 30 },
      { type: "deposit", productId: 1 },
      { type: "follow_up", title: "Call back" },
    ]);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.type)).toEqual(["deposit", "follow_up"]);
  });

  it("rejects a negative price rather than treating it as a discount", () => {
    expect(parseActions([{
      type: "sale", items: [{ description: "site", quantity: 1, unitPriceCents: -100 }],
    }])).toHaveLength(0);
  });
});

describe("the analysis envelope", () => {
  it("keeps the controlled outcome vocabulary — what the Xphere seam needs", () => {
    const parsed = visitAnalysisSchema.parse({
      summary: "Deixou 30 chaveiros", sentiment: "positive", visitStatus: "sale_made", actions: [],
    });
    expect(parsed.visitStatus).toBe("sale_made");
  });

  it("rejects an outcome outside the enum instead of passing prose through", () => {
    expect(visitAnalysisSchema.safeParse({ visitStatus: "muito bom", actions: [] }).success).toBe(false);
  });

  it("defaults actions to empty so a note-only reply is still valid", () => {
    expect(visitAnalysisSchema.parse({ summary: "Ninguém no local" }).actions).toEqual([]);
  });
});

describe("a hand-edited proposal goes through the same gate", () => {
  // The edit route merged a free-form object into the stored payload and
  // nothing re-checked it: validation only ever ran on the model's output. An
  // edited row could carry a negative price or quantity into the apply step,
  // which trusted it. Both the edit and the apply now parse against this
  // contract, so these are the cases that must be refused either way.
  const merge = (base: Record<string, unknown>, edit: Record<string, unknown>) =>
    visitActionSchema.safeParse({ ...base, ...edit });

  const deposit = { type: "deposit", productId: 1, quantity: 30, unitPriceCents: 500 };
  const sale = { type: "sale", items: [{ description: "site", quantity: 1, unitPriceCents: 60000 }] };

  it("accepts a plausible correction — thirty was really thirteen", () => {
    const result = merge(deposit, { quantity: 13 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ quantity: 13 });
  });

  it("refuses a negative or zero quantity", () => {
    expect(merge(deposit, { quantity: -500 }).success).toBe(false);
    expect(merge(deposit, { quantity: 0 }).success).toBe(false);
  });

  it("refuses a negative price on a deposit or a sale line", () => {
    expect(merge(deposit, { unitPriceCents: -100 }).success).toBe(false);
    expect(merge(sale, { items: [{ description: "site", quantity: 1, unitPriceCents: -100 }] }).success).toBe(false);
  });

  it("refuses emptying a sale of its items", () => {
    expect(merge(sale, { items: [] }).success).toBe(false);
  });

  it("refuses a settlement edited into saying nothing about the stock", () => {
    const settlement = { type: "settlement", consignmentId: 7, soldQuantity: 10 };
    expect(merge(settlement, { soldQuantity: null }).success).toBe(false);
  });
});
