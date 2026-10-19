import { Router } from "express";
import { requireXpotUser } from "./middleware.js";
import { resolveGoogleApiKey } from "./google.js";
import { rateLimit } from "../../tags/rateLimit.js";

const placeCache = new Map<string, { expiresAt: number; value: unknown }>();
const cached = (key: string) => {
  const hit = placeCache.get(key);
  if (!hit || hit.expiresAt < Date.now()) {
    if (hit) placeCache.delete(key);
    return undefined;
  }
  return hit.value;
};
const remember = (key: string, value: unknown) => {
  if (placeCache.size > 500) {
    const oldest = placeCache.keys().next().value;
    if (oldest) placeCache.delete(oldest);
  }
  placeCache.set(key, { expiresAt: Date.now() + 60_000, value });
};

export function createPlaceSearchRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/place-autocomplete", async (req, res) => {
    const actor = (req as any).xpotActor as { rep: { id: number } };
    if (rateLimit(`places:autocomplete:${actor.rep.id}`, { limit: 60, windowMs: 60_000 })) {
      return res.status(429).json({ message: "Too many place searches. Please wait a moment." });
    }
    const input = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (input.length < 2) return res.json({ suggestions: [] });
    const cacheKey = `autocomplete:${input.toLowerCase()}`;
    const cacheHit = cached(cacheKey);
    if (cacheHit) return res.json(cacheHit);

    const apiKey = await resolveGoogleApiKey();
    if (!apiKey) {
      return res.status(503).json({ message: "Google Places is not configured. Please add API key in Admin > Integrations." });
    }

    try {
      const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "suggestions.placePrediction.placeId",
            "suggestions.placePrediction.text.text",
            "suggestions.placePrediction.structuredFormat.mainText.text",
            "suggestions.placePrediction.structuredFormat.secondaryText.text",
          ].join(","),
        },
        body: JSON.stringify({
          input,
          includedPrimaryTypes: ["(cities)"],
          includedRegionCodes: ["us"],
          languageCode: "en",
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        return res.status(502).json({ message: detail || "Google Places autocomplete failed" });
      }

      const data = await response.json() as {
        suggestions?: Array<{
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
          };
        }>;
      };
      const result = {
        suggestions: (data.suggestions ?? []).flatMap((suggestion) => {
          const prediction = suggestion.placePrediction;
          const label = prediction?.text?.text?.trim();
          if (!prediction?.placeId || !label) return [];
          return [{
            placeId: prediction.placeId,
            label,
            mainText: prediction.structuredFormat?.mainText?.text?.trim() || label,
            secondaryText: prediction.structuredFormat?.secondaryText?.text?.trim() || "",
          }];
        }),
      };
      remember(cacheKey, result);
      res.json(result);
    } catch (err) {
      return res.status(502).json({ message: (err as Error).message || "Google Places autocomplete failed" });
    }
  });

  router.get("/place-search", async (req, res) => {
    const actor = (req as any).xpotActor as { rep: { id: number } };
    if (rateLimit(`places:search:${actor.rep.id}`, { limit: 30, windowMs: 60_000 })) {
      return res.status(429).json({ message: "Too many place searches. Please wait a moment." });
    }
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const apiKey = await resolveGoogleApiKey();

    if (!apiKey) {
      return res.status(503).json({ message: "Google Places is not configured. Please add API key in Admin > Integrations." });
    }

    try {
      const lat = typeof req.query.lat === "string" ? Number(req.query.lat) : undefined;
      const lng = typeof req.query.lng === "string" ? Number(req.query.lng) : undefined;
      const cacheKey = `search:${query.toLowerCase()}:${Number.isFinite(lat) ? Number(lat).toFixed(3) : ""}:${Number.isFinite(lng) ? Number(lng).toFixed(3) : ""}`;
      const cacheHit = cached(cacheKey);
      if (cacheHit) return res.json(cacheHit);

      const payload: Record<string, unknown> = {
        textQuery: query,
        pageSize: 6,
        languageCode: "en",
        regionCode: "US",
        strictTypeFiltering: false,
      };

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        payload.locationBias = {
          circle: {
            center: {
              latitude: lat,
              longitude: lng,
            },
            radius: 15000,
          },
        };
      }

      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.primaryType",
            "places.primaryTypeDisplayName",
            "places.websiteUri",
            "places.nationalPhoneNumber",
          ].join(","),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Google Places search failed";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson?.error?.message || errorText || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        return res.status(502).json({ message: errorMessage });
      }

      const data = await response.json() as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          primaryType?: string;
          primaryTypeDisplayName?: { text?: string };
          websiteUri?: string;
          nationalPhoneNumber?: string;
        }>;
      };

      const result = {
        results: (data.places || []).map((place) => ({
          placeId: place.id || "",
          name: place.displayName?.text || "Unnamed place",
          address: place.formattedAddress || "",
          phone: place.nationalPhoneNumber || "",
          website: place.websiteUri || "",
          // The Table A code ("dental_clinic") is what the app translates; Google's
          // English display name is the fallback for a type it does not know.
          primaryType: place.primaryType || "",
          primaryTypeName: place.primaryTypeDisplayName?.text || "",
          lat: place.location?.latitude,
          lng: place.location?.longitude,
        })).filter((place) => place.placeId && place.name),
      };
      remember(cacheKey, result);
      res.json(result);
    } catch (err) {
      return res.status(502).json({ message: (err as Error).message || "Google Places request failed" });
    }
  });

  return router;
}
