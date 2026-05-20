import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser } from "./middleware.js";

export function createPlaceSearchRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/place-search", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const googlePlacesSettings = await storage.getIntegrationSettings("google_places");
    let apiKey: string | null = googlePlacesSettings?.isEnabled && googlePlacesSettings.apiKey 
      ? googlePlacesSettings.apiKey 
      : null;
    
    if (!apiKey) {
      apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
    }
    
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
