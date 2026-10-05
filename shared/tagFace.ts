// Xpot Tags — the "face" of a piece: what is printed on it (the Instagram mark,
// Google's G, a phone, an envelope…). It is physical and never changes with the
// destination: a piece printed with the Instagram mark stays an Instagram piece
// even if its owner points it somewhere else for a while.
//
// The face is set on the batch (every piece of a run is printed alike) and can be
// overridden per piece. When neither says, a product with one obvious face
// (a Google Review sign) answers for it; otherwise the face is unknown (null).

import type { TagProductType } from "./tags.js";

export const TAG_FACES = [
  "google_review",
  "instagram",
  "facebook",
  "tiktok",
  "whatsapp",
  "youtube",
  "linkedin",
  "website",
  "phone",
  "email",
  "menu",
  "booking",
  "vcard",
  "custom",
] as const;
export type TagFace = (typeof TAG_FACES)[number];

export const TAG_FACE_LABELS: Record<TagFace, string> = {
  google_review: "Google review",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  website: "Website",
  phone: "Phone call",
  email: "Email",
  menu: "Menu",
  booking: "Booking",
  vcard: "Contact card",
  custom: "Custom",
};

/** The face a product implies when nobody set one. Only products with a single obvious print. */
const PRODUCT_FACE: Partial<Record<TagProductType, TagFace>> = {
  google_review_sign: "google_review",
  menu_tag: "menu",
  booking_tag: "booking",
};

export function isTagFace(value: unknown): value is TagFace {
  return typeof value === "string" && (TAG_FACES as readonly string[]).includes(value);
}

/** The piece's own face, else its batch's, else its product's; null when nothing says. */
export function resolveTagFace(input: { face?: string | null; batchFace?: string | null; productType?: string | null }): TagFace | null {
  if (isTagFace(input.face)) return input.face;
  if (isTagFace(input.batchFace)) return input.batchFace;
  return PRODUCT_FACE[input.productType as TagProductType] ?? null;
}

export const tagFaceLabel = (face: string | null | undefined): string =>
  isTagFace(face) ? TAG_FACE_LABELS[face] : "Not set";
