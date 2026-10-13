import { Router } from "express";
import { requireXpotUser } from "./middleware.js";
import { resolveGoogleApiKey } from "./google.js";

export function createPlaceSearchRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/place-autocomplete", async (req, res) => {
    const input = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (input.length < 2) return res.json({ suggestions: [] });

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
      res.json({
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
      });
    } catch (err) {
      return res.status(502).json({ message: (err as Error).message || "Google Places autocomplete failed" });
    }
  });

  router.get("/place-search", async (req, res) => {
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
          primaryTypeDisplayName?: { text?: string };
          websiteUri?: string;
          nationalPhoneNumber?: string;
        }>;
      };

      res.json({
        results: (data.places || []).map((place) => ({
          placeId: place.id || "",
          name: place.displayName?.text || "Unnamed place",
          address: place.formattedAddress || "",
          phone: place.nationalPhoneNumber || "",
          website: place.websiteUri || "",
          primaryType: place.primaryTypeDisplayName?.text || "",
          lat: place.location?.latitude,
          lng: place.location?.longitude,
        })).filter((place) => place.placeId && place.name),
      });
    } catch (err) {
      return res.status(502).json({ message: (err as Error).message || "Google Places request failed" });
    }
  });

  return router;
}
