import type { Express } from "express";
import { toShopProducts, type TagShopCatalog } from "#shared/tagShowcase.js";
import { actorOf, requireTagUser } from "./access.js";
import { ensureWholesaleCode, storeBaseUrl } from "../wholesale/index.js";

// Tags › Shop, the Stuscle half: the wholesale catalogue read from Stuscle (`GET /xpot/wholesale-catalog`, the same
// products and prices its /wholesale page shows), so the Shop lists exactly what can be bought without anyone typing
// it in here. Server to server with the shared XPOT_WHOLESALE_SECRET; Stuscle's answer is kept a minute, since every
// reseller sees the same catalogue and only the links (their own code) differ. When Stuscle cannot be read the Shop
// still opens, with the entries the Xpot admin keeps.
//
//   STUSCLE_API_URL  the Stuscle backend (default https://api.stuscle.com)

const API_DEFAULT_URL = "https://api.stuscle.com";
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

let cached: { at: number; body: unknown } | null = null;

export function stuscleApiUrl(): string {
  return (process.env.STUSCLE_API_URL || API_DEFAULT_URL).replace(/\/+$/, "");
}

async function fetchCatalog(secret: string): Promise<unknown> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.body;
  const res = await fetch(`${stuscleApiUrl()}/xpot/wholesale-catalog?currency=usd`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Stuscle answered ${res.status}`);
  const body: unknown = await res.json();
  cached = { at: Date.now(), body };
  return body;
}

export async function shopCatalogForRep(repId: number): Promise<TagShopCatalog> {
  const secret = process.env.XPOT_WHOLESALE_SECRET;
  if (!secret) return { status: "not_configured", currency: "USD", products: [] };
  let body: unknown;
  try {
    body = await fetchCatalog(secret);
  } catch (err) {
    console.warn("[tags] Stuscle wholesale catalogue unavailable:", (err as Error).message);
    return { status: "unavailable", currency: "USD", products: [] };
  }
  const code = await ensureWholesaleCode(repId);
  return { status: "ok", ...toShopProducts(body, storeBaseUrl(), code) };
}

export function registerShopCatalogRoutes(app: Express) {
  // Any signed-in Tags user: the catalogue, each variant with the link that carries their own wholesale code.
  app.get("/api/xpot/tags/shop-catalog", requireTagUser, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await shopCatalogForRep(actorOf(req).repId));
    } catch (err) {
      console.error("[tags] Failed to load the shop catalogue:", err);
      res.status(500).json({ message: "Failed to load the shop" });
    }
  });
}
