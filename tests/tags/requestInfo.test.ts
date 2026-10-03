import { test } from "vitest";
import assert from "node:assert/strict";
import {
  browserFamilyFromUserAgent,
  deviceTypeFromUserAgent,
  isBotUserAgent,
  osFamilyFromUserAgent,
  referrerHost,
  trustedCountryCode,
  visitorDayKey,
} from "../../server/tags/requestInfo.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

test("visitor day key is stable within a day, rotates across days, never contains the IP", () => {
  const day1 = new Date("2026-10-01T08:00:00Z");
  const day1Later = new Date("2026-10-01T22:00:00Z");
  const day2 = new Date("2026-10-02T08:00:00Z");
  const a = visitorDayKey("203.0.113.9", IPHONE, day1, "secret");
  assert.equal(a, visitorDayKey("203.0.113.9", IPHONE, day1Later, "secret"));
  assert.notEqual(a, visitorDayKey("203.0.113.9", IPHONE, day2, "secret"));
  assert.notEqual(a, visitorDayKey("203.0.113.10", IPHONE, day1, "secret"));
  assert.notEqual(a, visitorDayKey("203.0.113.9", IPHONE, day1, "other-secret"));
  assert.ok(!a.includes("203"));
  assert.match(a, /^[0-9a-f]{32}$/);
});

test("bots, previews and scripts are flagged; real phones are not", () => {
  assert.equal(isBotUserAgent(IPHONE), false);
  assert.equal(isBotUserAgent(ANDROID), false);
  for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "WhatsApp/2.23", "curl/8.4.0", "python-requests/2.31", "", undefined]) {
    assert.equal(isBotUserAgent(ua), true, String(ua));
  }
});

test("coarse device / OS / browser classification", () => {
  assert.equal(deviceTypeFromUserAgent(IPHONE), "mobile");
  assert.equal(osFamilyFromUserAgent(IPHONE), "iOS");
  assert.equal(browserFamilyFromUserAgent(IPHONE), "Safari");
  assert.equal(deviceTypeFromUserAgent(ANDROID), "mobile");
  assert.equal(osFamilyFromUserAgent(ANDROID), "Android");
  assert.equal(browserFamilyFromUserAgent(ANDROID), "Chrome");
});

test("country header is ignored unless explicitly trusted", () => {
  const prev = process.env.TAG_COUNTRY_HEADER;
  try {
    delete process.env.TAG_COUNTRY_HEADER;
    assert.equal(trustedCountryCode({ "cf-ipcountry": "BR" }), null);
    process.env.TAG_COUNTRY_HEADER = "CF-IPCountry";
    assert.equal(trustedCountryCode({ "cf-ipcountry": "br" }), "BR");
    assert.equal(trustedCountryCode({ "cf-ipcountry": "XX" }), null);
    assert.equal(trustedCountryCode({ "cf-ipcountry": "<script>" }), null);
  } finally {
    if (prev === undefined) delete process.env.TAG_COUNTRY_HEADER;
    else process.env.TAG_COUNTRY_HEADER = prev;
  }
});

test("referrer keeps only the host", () => {
  assert.equal(referrerHost("https://www.google.com/search?q=me&email=x@y.com"), "www.google.com");
  assert.equal(referrerHost("garbage"), null);
  assert.equal(referrerHost(undefined), null);
});
