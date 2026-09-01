import { Router } from "express";
import { salesStorage } from "../../storage-sales.js";
import { requireXpotUser, requireXpotManager } from "./middleware.js";
import { xpotProductUpsertSchema, xpotPriceTiersReplaceSchema } from "#shared/xpot.js";

// Catalog of what the team sells: digital services sold on the spot and
// physical goods (3D prints) that can be left on consignment. Reading is open
// to every rep — they price from it — writing is manager/admin.
export function createProductsRouter() {
  const router = Router();

  // GET /products[?all=true] — active catalog with volume tiers attached.
  router.get("/products", requireXpotUser, async (req, res) => {
    const actor = (req as any).xpotActor;
    const includeInactive = req.query.all === "true" && (actor.user.isAdmin || ["manager", "admin"].includes(actor.rep.role));
    const products = await salesStorage.listProducts({ includeInactive });
    const tiers = await salesStorage.listTiersBatch(products.map((p) => p.id));
    const tiersByProduct = new Map<number, typeof tiers>();
    for (const tier of tiers) {
      if (!tiersByProduct.has(tier.productId)) tiersByProduct.set(tier.productId, []);
      tiersByProduct.get(tier.productId)!.push(tier);
    }
    res.json(products.map((product) => ({ ...product, tiers: tiersByProduct.get(product.id) ?? [] })));
  });

  // GET /products/:id/price?quantity=N — catalog price for a quantity.
  router.get("/products/:id/price", requireXpotUser, async (req, res) => {
    const id = Number(req.params.id);
    const quantity = Math.max(1, Number(req.query.quantity) || 1);
    const priced = await salesStorage.priceProduct(id, quantity);
    if (!priced) return res.status(404).json({ message: "Product not found" });
    res.json({ productId: id, quantity, unitPriceCents: priced.unitPriceCents, currency: priced.product.currency });
  });

  router.post("/products", requireXpotManager, async (req, res) => {
    const input = xpotProductUpsertSchema.parse(req.body);
    const product = await salesStorage.createProduct({
      ...input,
      sku: input.sku || null,
      currency: (input.currency || "USD").toUpperCase(),
    });
    res.status(201).json({ ...product, tiers: [] });
  });

  router.patch("/products/:id", requireXpotManager, async (req, res) => {
    const id = Number(req.params.id);
    const input = xpotProductUpsertSchema.partial().parse(req.body);
    const patch = { ...input } as Record<string, unknown>;
    if (input.sku !== undefined) patch.sku = input.sku || null;
    if (input.currency) patch.currency = input.currency.toUpperCase();
    const product = await salesStorage.updateProduct(id, patch);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ ...product, tiers: await salesStorage.listTiers(id) });
  });

  // Soft delete — sales history keeps referencing the row.
  router.delete("/products/:id", requireXpotManager, async (req, res) => {
    const id = Number(req.params.id);
    const product = await salesStorage.updateProduct(id, { isActive: false });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(204).end();
  });

  router.put("/products/:id/tiers", requireXpotManager, async (req, res) => {
    const id = Number(req.params.id);
    const product = await salesStorage.getProduct(id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const { tiers } = xpotPriceTiersReplaceSchema.parse(req.body);
    const seen = new Set<number>();
    for (const tier of tiers) {
      if (seen.has(tier.minQuantity)) {
        return res.status(400).json({ message: `Duplicate tier at quantity ${tier.minQuantity}` });
      }
      seen.add(tier.minQuantity);
    }
    res.json(await salesStorage.replaceTiers(id, tiers));
  });

  return router;
}
