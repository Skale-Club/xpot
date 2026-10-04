import { test } from "vitest";
import assert from "node:assert/strict";
import { buildReviewUrl, extractFirstUrl, fidToPlaceId, isGoogleHost, isReviewFormUrl, parseGoogleUrl, placeIdFromReviewUrl } from "../../shared/reviewLink.js";

// Google Sydney: a published Place ID / feature id / CID triple.
const SYDNEY_PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const SYDNEY_FID = "0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52";

test("feature id rebuilds the published ChIJ place id", () => {
  assert.equal(fidToPlaceId(SYDNEY_FID), SYDNEY_PLACE_ID);
  assert.equal(fidToPlaceId("0x0:0x1"), null);
  assert.equal(fidToPlaceId("nope"), null);
});

test("review url format", () => {
  assert.equal(buildReviewUrl(SYDNEY_PLACE_ID), `https://search.google.com/local/writereview?placeid=${SYDNEY_PLACE_ID}`);
});

test("pulls the link out of text shared by the Maps app", () => {
  const shared = "Padaria Central\nRua das Flores, 123 - Centro\nhttps://maps.app.goo.gl/AbC123xyz?g_st=iw";
  assert.equal(extractFirstUrl(shared), "https://maps.app.goo.gl/AbC123xyz?g_st=iw");
  assert.equal(extractFirstUrl("veja (https://g.page/r/CQxyz123)."), "https://g.page/r/CQxyz123");
  assert.equal(extractFirstUrl("maps.app.goo.gl/AbC123"), "https://maps.app.goo.gl/AbC123");
  assert.equal(extractFirstUrl("Padaria Central"), null);
});

test("only Google hosts are accepted", () => {
  for (const h of ["maps.app.goo.gl", "share.google", "www.google.com", "www.google.com.br", "maps.google.co.uk", "consent.google.de"]) {
    assert.ok(isGoogleHost(h), h);
  }
  for (const h of ["evil.com", "google.com.evil.com", "notgoogle.com", "localhost", "127.0.0.1"]) {
    assert.ok(!isGoogleHost(h), h);
  }
});

test("full Maps place url → place id from the feature id, plus name and pin", () => {
  const url =
    "https://www.google.com/maps/place/Google+Sydney/@-33.866489,151.1958561,17z/data=!3m1!4b1!4m6!3m5!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52!8m2!3d-33.866489!4d151.1958561!16s%2Fg%2F1tdx7qmn?entry=ttu";
  const parsed = parseGoogleUrl(url);
  assert.equal(parsed.placeId, SYDNEY_PLACE_ID);
  assert.equal(parsed.name, "Google Sydney");
  assert.equal(parsed.lat, -33.866489);
  assert.equal(parsed.lng, 151.1958561);
});

test("explicit place id in the data blob or query wins", () => {
  assert.equal(
    parseGoogleUrl(`https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x1:0x2!19s${SYDNEY_PLACE_ID}`).placeId,
    SYDNEY_PLACE_ID,
  );
  assert.equal(
    parseGoogleUrl(`https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${SYDNEY_PLACE_ID}`).placeId,
    SYDNEY_PLACE_ID,
  );
});

test("ftid param (maps?q=… share form)", () => {
  const parsed = parseGoogleUrl(
    "https://maps.google.com/maps?q=Google+Sydney,+48+Pirrama+Rd&ftid=0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52&entry=gps",
  );
  assert.equal(parsed.placeId, SYDNEY_PLACE_ID);
  assert.equal(parsed.query, "Google Sydney, 48 Pirrama Rd");
});

test("g.page review short link", () => {
  assert.equal(parseGoogleUrl("https://g.page/r/CQxyz123AbC/review").directReviewUrl, "https://g.page/r/CQxyz123AbC/review");
  assert.equal(parseGoogleUrl("https://g.page/r/CQxyz123AbC").directReviewUrl, "https://g.page/r/CQxyz123AbC/review");
});

test("search url keeps the query for a Places lookup", () => {
  const parsed = parseGoogleUrl("https://www.google.com/search?q=Padaria+Central+Curitiba&kgmid=/g/11abc");
  assert.equal(parsed.placeId, undefined);
  assert.equal(parsed.query, "Padaria Central Curitiba");
});

test("consent interstitial exposes the real destination", () => {
  const target = "https://www.google.com/maps/place/X/data=!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52";
  const parsed = parseGoogleUrl(`https://consent.google.com/ml?continue=${encodeURIComponent(target)}&gl=DE`);
  assert.equal(parsed.continueUrl, target);
});

test("isReviewFormUrl: only links that open the review form", () => {
  assert.equal(isReviewFormUrl(buildReviewUrl(SYDNEY_PLACE_ID)), true);
  assert.equal(isReviewFormUrl("https://g.page/r/CbUyAbCdEfGhEAE/review"), true);
  assert.equal(isReviewFormUrl("https://g.page/r/CbUyAbCdEfGhEAE"), false);
  assert.equal(isReviewFormUrl("https://search.google.com/local/writereview"), false);
  assert.equal(isReviewFormUrl("https://maps.app.goo.gl/AbCdEf123"), false);
  assert.equal(isReviewFormUrl("https://www.google.com/maps/place/Google+Sydney"), false);
  assert.equal(isReviewFormUrl("not a url"), false);
});

test("placeIdFromReviewUrl reads the place id from a writereview link", () => {
  assert.equal(placeIdFromReviewUrl("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"), "ChIJN1t_tDeuEmsRUsoyG83frY4");
});

test("placeIdFromReviewUrl ignores other links and junk", () => {
  assert.equal(placeIdFromReviewUrl("https://maps.app.goo.gl/abc"), null);
  assert.equal(placeIdFromReviewUrl("https://evil.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"), null);
  assert.equal(placeIdFromReviewUrl("https://search.google.com/local/writereview?placeid=<script>"), null);
  assert.equal(placeIdFromReviewUrl(null), null);
  assert.equal(placeIdFromReviewUrl("not a url"), null);
});
