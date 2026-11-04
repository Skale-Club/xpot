// Xpot Tags — the "face" of a piece: what is printed on it (the Instagram mark,
// Google's G, a phone, an envelope…). It is physical and never changes with the
// destination: a piece printed with the Instagram mark stays an Instagram piece
// even if its owner points it somewhere else for a while.
//
// The face is set on the batch (every piece of a run is printed alike) and can be
// overridden per piece. When neither says, a product with one obvious face
// (a Google Review sign) answers for it; otherwise the face is unknown (null).

import type { TagProductType, TagDestinationType } from "./tags.js";
import { guessDestinationType, socialNetworkOf } from "./tagApp.js";
import { contentKindOf } from "./chipContent.js";

// The order every list of designs shows them in: what is used most comes first.
export const TAG_FACES = [
  "google_review",
  "instagram",
  "tiktok",
  "facebook",
  "website",
  "menu",
  "wifi",
  "whatsapp",
  "yelp",
  "venmo",
  "cashapp",
  "paypal",
  "zelle",
  "youtube",
  "linkedin",
  "phone",
  "email",
  "booking",
  "vcard",
  "custom",
] as const;
export type TagFace = (typeof TAG_FACES)[number];

export const TAG_FACE_LABELS: Record<TagFace, string> = {
  google_review: "Google Review",
  yelp: "Yelp",
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
  venmo: "Venmo",
  cashapp: "Cash App",
  paypal: "PayPal",
  zelle: "Zelle",
  wifi: "Wi-Fi",
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
/**
 * What a piece opens when that is not what is printed on it: a piece with the Instagram mark that opens a Google
 * review sends whoever scans it somewhere they did not expect. Only the faces that name one kind of destination are
 * checked (Google, a social network, a call, an email, a contact card); any other face accepts any link. Returns the
 * destination's own kind, or null when it matches, is unknown, or there is nothing to compare. A warning, never a block.
 */
export function destinationNotPrinted(face: string | null | undefined, url: string | null | undefined): TagDestinationType | null {
  if (!isTagFace(face) || !url) return null;
  const opens = guessDestinationType(url);
  const content = contentKindOf(url);
  switch (face) {
    case "google_review":
      return opens === "google_review" ? null : opens;
    case "instagram":
    case "facebook":
    case "tiktok":
    case "whatsapp":
      return socialNetworkOf(url) === face ? null : opens;
    case "phone":
    case "email":
    case "vcard":
      return content === face ? null : opens;
    default:
      return null;
  }
}
