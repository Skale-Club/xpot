// The contract between the LLM and the sales module.
//
// The model reads a visit's transcript with the catalog and the shop's live
// consignments as context, and answers with actions. Everything here is
// validated before a row is written: an action the model invents in the wrong
// shape is dropped, never guessed at.
//
// Kept in shared/ because the client renders these same shapes as editable
// proposal rows.

import { z } from "zod";

const confidence = z.number().min(0).max(1).optional();
const evidence = z.string().trim().max(400).optional().nullable();

/** "I left thirty keychains here." */
export const depositActionSchema = z.object({
  type: z.literal("deposit"),
  productId: z.number().int().positive().nullable().optional(),
  productName: z.string().trim().max(160).nullable().optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative().nullable().optional(),
  evidence,
  confidence,
});

/**
 * "He sold ten, I got paid for the ten, and I'm leaving ten more."
 *
 * The rep may phrase a settlement two ways — how many SOLD, or how many are
 * still on the shelf. Both are accepted and the server reconciles them against
 * the agreement's current stock, because only one of them is a fact the rep
 * actually verified.
 */
export const settlementActionSchema = z.object({
  type: z.literal("settlement"),
  consignmentId: z.number().int().positive().nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  productName: z.string().trim().max(160).nullable().optional(),
  soldQuantity: z.number().int().nonnegative().nullable().optional(),
  countedRemaining: z.number().int().nonnegative().nullable().optional(),
  restockQuantity: z.number().int().nonnegative().nullable().optional(),
  paid: z.boolean().nullable().optional(),
  evidence,
  confidence,
}).refine((a) => a.soldQuantity != null || a.countedRemaining != null, {
  message: "A settlement needs either how many sold or how many are left",
});

/** "I sold him a six-hundred-dollar site." */
export const saleActionSchema = z.object({
  type: z.literal("sale"),
  items: z.array(z.object({
    productId: z.number().int().positive().nullable().optional(),
    description: z.string().trim().max(200),
    quantity: z.number().int().positive().default(1),
    unitPriceCents: z.number().int().nonnegative().nullable().optional(),
  })).min(1).max(20),
  paid: z.boolean().nullable().optional(),
  evidence,
  confidence,
});

/** "He wants to know more about the site, asked me back next week." */
export const followUpActionSchema = z.object({
  type: z.literal("follow_up"),
  title: z.string().trim().min(1).max(200),
  interest: z.string().trim().max(200).nullable().optional(),
  /** Days from the visit; the server turns it into a date. */
  inDays: z.number().int().min(0).max(365).nullable().optional(),
  estimatedValueCents: z.number().int().nonnegative().nullable().optional(),
  evidence,
  confidence,
});

export const visitActionSchema = z.discriminatedUnion("type", [
  depositActionSchema,
  saleActionSchema,
  followUpActionSchema,
]).or(settlementActionSchema);

export const visitAnalysisSchema = z.object({
  summary: z.string().trim().max(1500).nullable().optional(),
  outcome: z.string().trim().max(300).nullable().optional(),
  nextStep: z.string().trim().max(300).nullable().optional(),
  sentiment: z.string().trim().max(100).nullable().optional(),
  objections: z.string().trim().max(600).nullable().optional(),
  competitorMentioned: z.string().trim().max(200).nullable().optional(),
  followUpRequired: z.boolean().optional(),
  /** The controlled vocabulary — what the visit outcome actually was. */
  visitStatus: z
    .enum(["sale_made", "follow_up", "came_back_later", "no_answer", "not_interested", "completed"])
    .nullable()
    .optional(),
  actions: z.array(z.unknown()).default([]),
});

export type DepositAction = z.infer<typeof depositActionSchema>;
export type SettlementAction = z.infer<typeof settlementActionSchema>;
export type SaleAction = z.infer<typeof saleActionSchema>;
export type FollowUpAction = z.infer<typeof followUpActionSchema>;
export type VisitAction = DepositAction | SettlementAction | SaleAction | FollowUpAction;
export type VisitAnalysis = z.infer<typeof visitAnalysisSchema>;

/**
 * Validate the model's actions one by one. A malformed action is dropped and
 * the rest survive — one bad line must not cost the rep the whole visit.
 */
export function parseActions(raw: unknown[]): VisitAction[] {
  const out: VisitAction[] = [];
  for (const item of raw) {
    const parsed = visitActionSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data as VisitAction);
  }
  return out;
}

/** Extract the JSON object from a model reply that may be fenced or chatty. */
export function extractJson(content: string | null | undefined): unknown | null {
  if (!content) return null;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : content).match(/\{[\s\S]*\}/);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate[0]);
  } catch {
    return null;
  }
}

// ─── Context handed to the model ─────────────────────────────────────────────

export type ActionContextProduct = {
  id: number;
  name: string;
  kind: string;
  consignable: boolean;
  basePriceCents: number;
  unitLabel: string;
};

export type ActionContextConsignment = {
  id: number;
  productId: number;
  productName: string;
  quantityOnHand: number;
  unitPriceCents: number;
};

export type ActionContext = {
  leadName: string;
  products: ActionContextProduct[];
  consignments: ActionContextConsignment[];
  /** Actions already proposed or applied on this visit, so a second recording
   *  of the same story does not duplicate them. */
  existing?: { type: string; summary: string }[];
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function buildActionPrompt(transcript: string, ctx: ActionContext): string {
  const products = ctx.products.length
    ? ctx.products
        .map((p) => `  - id=${p.id} "${p.name}" (${p.kind}, ${money(p.basePriceCents)}/${p.unitLabel}${p.consignable ? ", consignable" : ""})`)
        .join("\n")
    : "  (none)";

  const consignments = ctx.consignments.length
    ? ctx.consignments
        .map((c) => `  - consignmentId=${c.id} productId=${c.productId} "${c.productName}": ${c.quantityOnHand} on the shelf at ${money(c.unitPriceCents)} each`)
        .join("\n")
    : "  (none — nothing of ours is on their shelf)";

  const already = ctx.existing?.length
    ? `\nAlready recorded on this visit (do NOT propose these again):\n${ctx.existing.map((e) => `  - ${e.type}: ${e.summary}`).join("\n")}\n`
    : "";

  return `You read a field sales rep's voice note, recorded during or right after a visit to "${ctx.leadName}", and turn it into structured actions.

The rep sells digital services and physical goods. Physical goods are often left ON CONSIGNMENT: the rep leaves stock, the shop resells it at whatever price they like, and on a later visit the rep counts what is left, bills for what sold, and may restock.

Our catalog:
${products}

Currently on this shop's shelf:
${consignments}
${already}
Return ONLY a JSON object, no prose, no markdown fence, with:
  "summary": short summary of the visit, in the transcript's language
  "outcome": brief result
  "nextStep": concrete next step if stated or clearly implied, else null
  "sentiment": one of positive, neutral, negative, mixed
  "objections": blockers mentioned, else null
  "competitorMentioned": competitor name if named, else null
  "followUpRequired": boolean
  "visitStatus": one of sale_made, follow_up, came_back_later, no_answer, not_interested, completed
  "actions": array, possibly empty

Action shapes — emit ONLY these, and only when the transcript clearly supports one:

{"type":"deposit","productId":<id|null>,"productName":"<text>","quantity":<int>,"unitPriceCents":<int|null>,"evidence":"<the sentence>","confidence":<0-1>}
  The rep LEFT stock. "I left thirty keychains here."

{"type":"settlement","consignmentId":<id|null>,"productId":<id|null>,"soldQuantity":<int|null>,"countedRemaining":<int|null>,"restockQuantity":<int|null>,"paid":<bool|null>,"evidence":"...","confidence":<0-1>}
  A reckoning of stock already on the shelf. Use soldQuantity when the rep says
  how many SOLD ("he sold ten"); use countedRemaining when they say what is
  LEFT ("only four left on the shelf"). Set restockQuantity when they leave
  more in the same breath ("and I'm leaving ten more"). Set paid=true when they
  say they were paid. Reference the consignmentId from the shelf list above.

{"type":"sale","items":[{"productId":<id|null>,"description":"<what>","quantity":<int>,"unitPriceCents":<int|null>}],"paid":<bool|null>,"evidence":"...","confidence":<0-1>}
  Something sold outright, digital or physical. "I sold him a six-hundred-dollar
  site" -> one item, description "site", unitPriceCents 60000. Match a catalog
  product when one clearly fits, else leave productId null and keep the words.

{"type":"follow_up","title":"<what to do>","interest":"<what they want>","inDays":<int|null>,"estimatedValueCents":<int|null>,"evidence":"...","confidence":<0-1>}
  Interest without a close. "He wants to know more about the site, asked me to
  come back next week" -> title "Come back about the site", interest "site",
  inDays 7.

Rules:
- Money in CENTS. "six hundred dollars" -> 60000. "five bucks each" -> 500.
- Numbers spoken as words become integers: "thirty" -> 30.
- If the shop has stock of a product and the rep talks about it selling, that is
  a settlement, NOT a sale. A sale is for goods handed over and paid for now.
- If there is no consignment for what they describe selling, it IS a sale.
- Emit NOTHING you are not sure about. "Nobody was there, I'll come back" has no
  actions at all. Inventing a quantity is far worse than omitting an action.
- One action per real event. Do not split or duplicate.
- Order actions as they happened: a settlement before the restock that follows it.

Transcript:
"""${transcript}"""`;
}

/** One-line description of a proposal, for the review list and the dedup hint. */
export function describeAction(action: VisitAction, currency = "USD"): string {
  const fmt = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(c / 100);
  switch (action.type) {
    case "deposit":
      return `Leave ${action.quantity} × ${action.productName ?? "product"}${action.unitPriceCents ? ` at ${fmt(action.unitPriceCents)}` : ""}`;
    case "settlement": {
      const sold = action.soldQuantity != null ? `${action.soldQuantity} sold` : `${action.countedRemaining} left on the shelf`;
      const restock = action.restockQuantity ? `, restock ${action.restockQuantity}` : "";
      return `Settle ${action.productName ?? "stock"} — ${sold}${restock}`;
    }
    case "sale": {
      const total = action.items.reduce((sum, i) => sum + (i.unitPriceCents ?? 0) * (i.quantity ?? 1), 0);
      const what = action.items.map((i) => `${i.quantity ?? 1}× ${i.description}`).join(", ");
      return `Sell ${what}${total ? ` — ${fmt(total)}` : ""}`;
    }
    case "follow_up":
      return `${action.title}${action.inDays != null ? ` (in ${action.inDays}d)` : ""}`;
  }
}
