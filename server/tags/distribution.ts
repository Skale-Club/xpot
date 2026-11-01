import type { Distribution } from "#shared/organizations.js";

// How an organization's pieces reach the people who sell them (docs/PROFILES_EXECUTION_PLAN.md, F6, decision D3).
//
// Each partner will have their own way of selling and distributing. In the US Xpot handles it; outside the US it can't
// (Stuscle is in the US, so a partner in Brazil can't necessarily buy through it). That stays open until the first
// partner exists, so this file is only the SEAM: it names the questions every path has to answer, answers them for the
// one path that exists today (`xpot`) and for the minimal `own` one, and is used where it decides something real:
//
//   * Stuscle verify / orders and GET /api/xpot/wholesale (server/wholesale/index.ts): whose orders are ours to fulfil.
//   * POST /api/xpot/admin/tag-kits (server/tags/routes.ts): whose stock a kit may leave from, and to whom.
//
// No store, order flow or payment for partners lives in Xpot. Left for when the first partner arrives (each is a
// field of DistributionPath below, so the place to plug it in is already named):
//   * receivesOrdersVia: how that partner's customers order (a store of their own, WhatsApp, a spreadsheet...). Today
//     `partner_offline` means "outside Xpot": nothing is recorded here.
//   * fulfilsFrom: for a US partner (`xpot`) it is open whether a Stuscle order may be separated from THEIR stock
//     instead of ours (server/tags/acquisitions.ts lockFulfillmentTags is company-only on purpose).
//   * recordsPayment: Xpot never records the payment, in either path; Stuscle charges in its own checkout.

/** Where an order for pieces is received. */
export type OrderReceiver =
  /** Stuscle's store: it calls Xpot (server/wholesale/index.ts) and the order becomes a tag_acquisition. */
  | "stuscle"
  /** The partner's own channel, outside Xpot: Xpot never sees the order. */
  | "partner_offline";

/** Whose house stock fulfils an order or a hand-out. */
export type StockSource =
  /** The company's (`xpot-company`) pieces. */
  | "company"
  /** The partner's own organization's pieces. */
  | "partner";

/** Who a kit may be handed to. */
export type HandOutReach =
  /** Only the people of the organization the pieces already belong to. */
  | "own_people"
  /** Also the people of the selling organizations the platform linked to the partner (organization_links). */
  | "linked_organizations";

export interface DistributionPath {
  distribution: Distribution;
  /** Who receives the order. */
  receivesOrdersVia: OrderReceiver;
  /** Whose stock fulfils it. */
  fulfilsFrom: StockSource;
  /** Whether Xpot records the payment. Never: it is Stuscle's, or the partner's. Typed `false` so it can't be turned on by accident. */
  recordsPayment: false;
  /** Who a kit may be handed to from this organization's house stock. */
  handsOutTo: HandOutReach;
}

const XPOT_PATH: DistributionPath = {
  distribution: "xpot",
  receivesOrdersVia: "stuscle",
  fulfilsFrom: "company",
  recordsPayment: false,
  handsOutTo: "own_people",
};

const OWN_PATH: DistributionPath = {
  distribution: "own",
  receivesOrdersVia: "partner_offline",
  fulfilsFrom: "partner",
  recordsPayment: false,
  handsOutTo: "linked_organizations",
};

/** The path an organization follows. Anything that is not exactly `own` (a missing value, an old row) is today's `xpot`. */
export function distributionOf(organization: { distribution?: string | null } | null | undefined): DistributionPath {
  return organization?.distribution === "own" ? OWN_PATH : XPOT_PATH;
}

/** Whether Xpot (Stuscle) receives this path's orders: if not, an order for these people is not ours to fulfil. */
export function ordersReachXpot(path: DistributionPath): boolean {
  return path.receivesOrdersVia === "stuscle";
}

/**
 * The path that governs a buyer's orders: their own organization's, unless they sell for a partner that handles its own
 * distribution (a linked seller), whose path wins. People of `xpot` organizations with no `own` partner are today's.
 */
export function distributionForBuyer(
  organization: { distribution?: string | null } | null | undefined,
  linkedProducers: ReadonlyArray<{ distribution?: string | null }>,
): DistributionPath {
  const own = organization?.distribution === "own" || linkedProducers.some((producer) => producer.distribution === "own");
  return own ? OWN_PATH : XPOT_PATH;
}

/** A partner organization as the hand-out decision sees it. */
export interface HandOutProducer {
  id: number;
  distribution: string | null;
  isActive: boolean;
  /** The selling organizations the platform linked to it. */
  linkedSellerIds: readonly number[];
}

export type HandOutSource = { ok: true; sourceOrganizationId: number } | { ok: false };

/**
 * From whose house stock a kit for someone in `targetOrganizationId` leaves, or that it may not be handed out at all.
 * `scope` is the giver's (server/tags/access.ts TagScope): null = the platform, otherwise the organizations they own.
 *   * the platform hands out the company's stock, to anyone;
 *   * an owner hands out their organization's stock to their own people;
 *   * the owner of an active partner whose distribution is `own` may also hand their own house stock to a person of a
 *     selling organization linked to them. A partner on `xpot` can't: their pieces reach people through Stuscle.
 * `producers` only needs to cover the organizations in scope. When two of them link the same seller the lowest id gives.
 */
export function handOutSource(input: {
  scope: readonly number[] | null;
  targetOrganizationId: number;
  companyOrganizationId: number;
  producers: readonly HandOutProducer[];
}): HandOutSource {
  const { scope, targetOrganizationId, companyOrganizationId, producers } = input;
  if (scope === null) return { ok: true, sourceOrganizationId: companyOrganizationId };
  if (scope.includes(targetOrganizationId)) return { ok: true, sourceOrganizationId: targetOrganizationId };
  const giver = [...producers]
    .sort((a, b) => a.id - b.id)
    .find((producer) =>
      scope.includes(producer.id)
      && producer.isActive
      && distributionOf(producer).handsOutTo === "linked_organizations"
      && producer.linkedSellerIds.includes(targetOrganizationId));
  return giver ? { ok: true, sourceOrganizationId: giver.id } : { ok: false };
}
