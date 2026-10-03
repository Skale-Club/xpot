import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveReviewLink, ReviewLinkError } from "../../server/tags/reviewLink.js";

const SYDNEY_PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const SYDNEY_MAPS_URL =
  "https://www.google.com/maps/place/Google+Sydney/data=!4m2!3m1!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52";

type Handler = (url: string, init?: RequestInit) => Response;

function fakeFetch(handler: Handler) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

test("maps.app.goo.gl share text → follows the redirect, builds the link offline", async () => {
  const { impl, calls } = fakeFetch((url) => {
    assert.equal(url, "https://maps.app.goo.gl/AbC123");
    return new Response(null, { status: 302, headers: { location: SYDNEY_MAPS_URL } });
  });
  const places = await resolveReviewLink("Google Sydney\n48 Pirrama Rd\nhttps://maps.app.goo.gl/AbC123", {
    fetchImpl: impl,
  });
  assert.equal(calls.length, 1, "the google.com URL itself is never fetched");
  assert.deepEqual(places, [
    {
      placeId: SYDNEY_PLACE_ID,
      name: "Google Sydney",
      reviewUrl: `https://search.google.com/local/writereview?placeid=${SYDNEY_PLACE_ID}`,
    },
  ]);
});

test("with a Places key the result is confirmed with name and address", async () => {
  const { impl } = fakeFetch((url, init) => {
    assert.ok(url.startsWith("https://places.googleapis.com/v1/places/"));
    assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "k");
    return Response.json({ id: SYDNEY_PLACE_ID, displayName: { text: "Google" }, formattedAddress: "48 Pirrama Rd" });
  });
  const [place] = await resolveReviewLink(SYDNEY_MAPS_URL, { fetchImpl: impl, apiKey: "k" });
  assert.equal(place.name, "Google");
  assert.equal(place.address, "48 Pirrama Rd");
});

test("non-Google links are rejected without any request", async () => {
  const { impl, calls } = fakeFetch(() => new Response(null));
  await assert.rejects(
    resolveReviewLink("https://evil.example/redirect", { fetchImpl: impl }),
    (err) => err instanceof ReviewLinkError && err.status === 400,
  );
  assert.equal(calls.length, 0);
});

test("a short link redirecting off Google is not followed", async () => {
  const { impl, calls } = fakeFetch(() => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
  await assert.rejects(resolveReviewLink("https://maps.app.goo.gl/x", { fetchImpl: impl }), ReviewLinkError);
  assert.equal(calls.length, 1);
});

test("business name search uses Places with the device location", async () => {
  const { impl } = fakeFetch((url, init) => {
    assert.equal(url, "https://places.googleapis.com/v1/places:searchText");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.textQuery, "Padaria Central");
    assert.deepEqual(body.locationBias.circle.center, { latitude: -25.4, longitude: -49.2 });
    return Response.json({
      places: [
        { id: "ChIJaaaaaaaaaaaaaaaaaaaaaaa", displayName: { text: "Padaria Central" }, formattedAddress: "Rua A" },
        { id: "ChIJbbbbbbbbbbbbbbbbbbbbbbb", displayName: { text: "Padaria Central II" }, formattedAddress: "Rua B" },
      ],
    });
  });
  const places = await resolveReviewLink("Padaria Central", { fetchImpl: impl, apiKey: "k", lat: -25.4, lng: -49.2 });
  assert.equal(places.length, 2);
  assert.equal(places[1].reviewUrl, "https://search.google.com/local/writereview?placeid=ChIJbbbbbbbbbbbbbbbbbbbbbbb");
});

test("name search without a Places key explains what is missing", async () => {
  await assert.rejects(
    resolveReviewLink("Padaria Central", { fetchImpl: fakeFetch(() => new Response(null)).impl }),
    (err) => err instanceof ReviewLinkError && err.status === 422,
  );
});
