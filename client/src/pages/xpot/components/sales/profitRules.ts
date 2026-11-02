// What "profit" means in the Sales overview. The server computes it as sold minus the product's cost, and a product
// with no cost entered has cost 0, so its "profit" is the whole sale (a 100% margin that nobody earned). The overview
// shows profit only where a cost exists. Free of app imports so the tests can load it.

type ProductSales = { revenueCents: number; profitCents?: number };

/** A product whose sales left less than they brought in had a cost entered; a profit equal to the sale did not. */
export function hasCost(product: ProductSales): boolean {
  return product.profitCents !== undefined && product.profitCents < product.revenueCents;
}

/** Profit and sales of the products that have a cost: "$42 of $90". `products` is how many those are. */
export function profitOnCostedProducts(byProduct: readonly ProductSales[]): { profitCents: number; revenueCents: number; products: number } {
  const costed = byProduct.filter(hasCost);
  return {
    profitCents: costed.reduce((sum, product) => sum + (product.profitCents ?? 0), 0),
    revenueCents: costed.reduce((sum, product) => sum + product.revenueCents, 0),
    products: costed.length,
  };
}
