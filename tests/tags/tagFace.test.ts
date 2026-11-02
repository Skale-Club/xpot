// The face of a piece (what is printed on it): the piece's own setting wins, then
// its batch's, then a product with one obvious print; anything else is unknown.
import assert from "node:assert/strict";
import { test } from "vitest";
import { destinationNotPrinted, isTagFace, resolveTagFace, tagFaceLabel, TAG_FACES } from "../../shared/tagFace.js";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
const { batchCreateSchema } = await import("../../server/tags/routes.js");

test("own face beats the batch's, which beats the product's", () => {
  assert.equal(resolveTagFace({ face: "email", batchFace: "instagram", productType: "google_review_sign" }), "email");
  assert.equal(resolveTagFace({ face: null, batchFace: "instagram", productType: "custom" }), "instagram");
  assert.equal(resolveTagFace({ face: null, batchFace: null, productType: "google_review_sign" }), "google_review");
});

test("a product with no single print has no face until someone sets one", () => {
  assert.equal(resolveTagFace({ productType: "custom" }), null);
  assert.equal(resolveTagFace({ productType: "keychain" }), null);
  assert.equal(resolveTagFace({}), null);
});

test("unknown stored values are ignored, not shown", () => {
  assert.equal(resolveTagFace({ face: "myspace", batchFace: "phone", productType: "custom" }), "phone");
  assert.equal(isTagFace("myspace"), false);
  assert.equal(tagFaceLabel("myspace"), "Not set");
  assert.equal(tagFaceLabel("whatsapp"), "WhatsApp");
});

test("non-social faces are first-class: website, phone call, email", () => {
  for (const face of ["website", "phone", "email", "custom"]) assert.ok((TAG_FACES as readonly string[]).includes(face));
});

test("payment faces are first-class: Venmo", () => {
  assert.ok(isTagFace("venmo"));
  assert.equal(tagFaceLabel("venmo"), "Venmo");
});

test("a batch accepts a face and rejects an unknown one", () => {
  const base = { name: "Instagram plaques", productType: "custom", salesProductId: 1, quantity: 4 };
  assert.equal(batchCreateSchema.parse({ ...base, face: "instagram" }).face, "instagram");
  assert.equal(batchCreateSchema.parse(base).face, undefined);
  assert.throws(() => batchCreateSchema.parse({ ...base, face: "myspace" }));
});
test("a link that is not what is printed on the piece is told apart, and only warns", () => {
  const google = "https://search.google.com/local/writereview?placeid=ChIJabc";
  // Printed for Instagram, opens a Google review.
  assert.equal(destinationNotPrinted("instagram", google), "google_review");
  assert.equal(destinationNotPrinted("instagram", "https://instagram.com/lab"), null);
  assert.equal(destinationNotPrinted("instagram", "https://www.facebook.com/lab"), "social");
  assert.equal(destinationNotPrinted("google_review", google), null);
  assert.equal(destinationNotPrinted("google_review", "https://shop.example.com"), "website");
  assert.equal(destinationNotPrinted("phone", "tel:+16175551182"), null);
  assert.equal(destinationNotPrinted("email", "https://example.com"), "website");
  // Nothing to compare, or a face that takes any link.
  assert.equal(destinationNotPrinted(null, google), null);
  assert.equal(destinationNotPrinted("instagram", null), null);
  assert.equal(destinationNotPrinted("website", google), null);
  assert.equal(destinationNotPrinted("custom", google), null);
  assert.equal(destinationNotPrinted("menu", google), null);
});
