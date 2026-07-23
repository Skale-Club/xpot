import { storage } from "../../storage.js";

// One place resolves the Google key for every Google-backed route (Places
// search, static maps). Admin > Integrations wins over the environment so a
// tenant can rotate the key without a redeploy.
export async function resolveGoogleApiKey(): Promise<string | null> {
  const settings = await storage.getIntegrationSettings("google_places");
  if (settings?.isEnabled && settings.apiKey) return settings.apiKey;
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
}
