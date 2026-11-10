export type ScreenName = keyof typeof import("./screens").screens;

/** Which code a URL needs. Query strings change screen data, not its bundle. */
export function routeScreens(url: string): ScreenName[] {
  const path = url.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (path.startsWith("/admin/work/")) return ["adminWork", ...routeScreens(path.slice("/admin/work".length))];
  if (/^\/organizations\/[^/]+\/people\//.test(path)) return ["organizationPerson"];
  if (/^\/organizations(?:\/|$)/.test(path)) return ["organizations"];
  if (path === "/settings") return ["settings"];
  if (/^\/academy(?:\/|$)/.test(path)) return ["academy"];
  if (/^\/admin\/tags(?:\/|$)/.test(path)) {
    const [, , , tab, id] = path.split("/");
    const screen: ScreenName = tab === "pieces" ? (id ? "tagDetail" : "tagPieces")
      : tab === "kits" ? "tagKits"
      : tab === "production" || tab === "batches" ? "tagProduction"
      : tab === "provisioners" ? "tagProvisioners"
      : tab === "journey" ? "tagJourney"
      : tab === "shop" ? "tagShowcase"
      : id ? "tagQueue" : "tagOverview";
    return ["adminTags", screen];
  }
  if (/^\/admin(?:\/|$)/.test(path)) {
    const section = path.split("/")[2] ?? "";
    const sections: Record<string, ScreenName> = { work: "adminWork", overview: "adminOverview", reps: "adminReps", integrations: "adminIntegrations", xphere: "adminIntegrations", branding: "adminBrandSite", landing: "adminBrandSite", products: "adminProducts", settings: "adminSettings", health: "adminHealth", academy: "adminAcademy" };
    return [sections[section] ?? "adminHome"];
  }
  if (/^\/tags(?:\/|$)/.test(path)) {
    const [, , tab, id] = path.split("/");
    if (tab === "pieces") return ["tagsPieces", ...(id ? ["tagsPiece" as const] : [])];
    if (tab === "t") return ["tagsPiece", "tagsPieces"];
    if (tab === "customers") return [id ? "tagsCustomer" : "tagsCustomers", "leads"];
    const sections: Record<string, ScreenName> = { orders: "tagsOrders", shop: "tagsShop", direct: "tagsDirect", results: "tagsResults" };
    return [sections[tab] ?? "tagsHome"];
  }
  if (/^\/(?:route\/check-in|check-in)(?:\/|$)/.test(path)) return ["checkIn"];
  if (/^\/(?:route|prospecting|leads\/prospecting|leads\/prospects)(?:\/|$)/.test(path)) return ["route"];
  if (/^\/leads(?:\/|$)/.test(path)) return ["leads"];
  if (/^\/sales(?:\/|$)/.test(path)) return ["sales"];
  if (/^\/tasks(?:\/|$)/.test(path)) return ["tasks"];
  if (/^\/(?:dashboard|visits)(?:\/|$)/.test(path)) return ["dashboard"];
  return [];
}
