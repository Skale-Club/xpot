import { Router } from "express";
import { requireXpotUser } from "./middleware.js";
import { resolveGoogleApiKey } from "./google.js";

// Dark basemap so the tile doesn't glare out of the app's UI. Google's own
// night preset, trimmed to the features this small a map actually shows.
const DARK_STYLE = [
  "element:geometry|color:0x0f1729",
  "element:labels.text.fill|color:0x8ec3b9",
  "element:labels.text.stroke|color:0x0f1729",
  "feature:administrative|element:geometry|color:0x334155",
  "feature:administrative.locality|element:labels.text.fill|color:0x94a3b8",
  "feature:poi|element:labels.text.fill|color:0x64748b",
  "feature:poi.park|element:geometry.fill|color:0x11291f",
  "feature:road|element:geometry|color:0x1e293b",
  "feature:road|element:labels.text.fill|color:0x94a3b8",
  "feature:road.highway|element:geometry|color:0x334155",
  "feature:transit|element:labels.text.fill|color:0x64748b",
  "feature:water|element:geometry|color:0x0a1020",
  "feature:water|element:labels.text.fill|color:0x3f5f6b",
];

const num = (value: unknown) => {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function createMapRouter() {
  const router = Router();
  router.use(requireXpotUser);

  // GET /map?lat=&lng=[&leadLat=&leadLng=][&zoom=][&w=][&h=]
  //
  // Proxies the Maps Static API so the key never reaches the browser. With a
  // lead position we let Google frame both pins instead of forcing a zoom —
  // what matters on a check-in screen is "how far am I from the door".
  router.get("/map", async (req, res) => {
    const lat = num(req.query.lat);
    const lng = num(req.query.lng);
    if (lat === null || lng === null) {
      return res.status(400).json({ message: "lat and lng are required" });
    }

    const apiKey = await resolveGoogleApiKey();
    if (!apiKey) {
      return res.status(503).json({ message: "Google Maps is not configured. Add an API key in Admin > Integrations." });
    }

    const leadLat = num(req.query.leadLat);
    const leadLng = num(req.query.leadLng);
    const hasLead = leadLat !== null && leadLng !== null;

    const width = Math.min(640, Math.max(120, num(req.query.w) ?? 400));
    const height = Math.min(640, Math.max(80, num(req.query.h) ?? 170));

    const params = new URLSearchParams();
    params.set("size", `${Math.round(width)}x${Math.round(height)}`);
    params.set("scale", "2");
    params.set("format", "png");
    params.set("maptype", "roadmap");
    // Rep pin (blue). Google auto-frames when center/zoom are omitted, which is
    // what we want as soon as there are two pins to fit.
    params.append("markers", `size:mid|color:0x3b82f6|${lat},${lng}`);
    if (hasLead) {
      params.append("markers", `size:mid|color:0x6366f1|label:V|${leadLat},${leadLng}`);
    } else {
      params.set("center", `${lat},${lng}`);
      params.set("zoom", String(Math.min(20, Math.max(1, Math.round(num(req.query.zoom) ?? 16)))));
    }
    for (const style of DARK_STYLE) params.append("style", style);
    params.set("key", apiKey);

    try {
      const upstream = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);

      if (!upstream.ok) {
        // Google puts the reason in the body (commonly: the Maps Static API is
        // not enabled on the project, or the key is referrer-restricted).
        const detail = (await upstream.text()).slice(0, 300);
        return res.status(502).json({ message: detail || "Google Maps request failed" });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.set("Content-Type", upstream.headers.get("content-type") || "image/png");
      // Private: the URL carries the rep's coordinates, so no shared cache.
      res.set("Cache-Control", "private, max-age=60");
      res.send(buffer);
    } catch (err) {
      res.status(502).json({ message: (err as Error).message || "Google Maps request failed" });
    }
  });

  return router;
}
