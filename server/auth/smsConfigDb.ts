// Twilio settings saved in Admin → Integrations ("twilio" row of
// integration_settings). Kept apart from sms.ts so that file never pulls in the
// database.

import { storage } from "../storage.js";
import { twilioConfigFromRow, type TwilioConfig } from "./sms.js";

export async function loadTwilioConfigFromDb(): Promise<TwilioConfig | null> {
  return twilioConfigFromRow(await storage.getIntegrationSettings("twilio"));
}
