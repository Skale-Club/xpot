/** The flyer is the service selector; physical recipes remain versioned in the print catalog. */
export const PRINT_DESIGN_GROUPS = ["all", "reviews", "social", "business", "payments"] as const;
export type PrintDesignGroup = typeof PRINT_DESIGN_GROUPS[number];
// In the order of TAG_FACES (shared/tagFace.ts): what is used most comes first.
export const PRINT_DESIGNS = [
  { face: "google_review", logo: "google", group: "reviews" },
  { face: "instagram", logo: "instagram", group: "social" },
  { face: "tiktok", logo: "tiktok", group: "social" },
  { face: "facebook", logo: "facebook", group: "social" },
  { face: "website", logo: "website", group: "business" },
  { face: "menu", logo: "menu", group: "business" },
  { face: "wifi", logo: "wifi", group: "business" },
  { face: "whatsapp", logo: null, group: "social" },
  { face: "yelp", logo: "yelp", group: "reviews" },
  { face: "venmo", logo: "venmo", group: "payments" },
  { face: "cashapp", logo: "cashapp", group: "payments" },
  { face: "paypal", logo: "paypal", group: "payments" },
  { face: "zelle", logo: "zelle", group: "payments" },
  { face: "youtube", logo: null, group: "social" },
  { face: "linkedin", logo: null, group: "social" },
] as const;

export const PRINT_PALETTE = [
  { theme: "white", hex: "#F2F2F2", contrast: "black" },
  { theme: "black", hex: "#161616", contrast: "white" },
] as const;

export function printDesignGroup(face: string): PrintDesignGroup {
  return PRINT_DESIGNS.find((design) => design.face === face)?.group ?? "business";
}

export function printStyle(params: Record<string, unknown> | undefined): string {
  if (typeof params?.style === "string") return params.style;
  const font = String(params?.font ?? "");
  return /italic/i.test(font) ? "italic" : /nunito/i.test(font) ? "rounded" : /inter/i.test(font) ? "spaced"
    : /metropolis.*bold/i.test(font) ? "bold" : /metropolis/i.test(font) ? "modern" : "classic";
}
