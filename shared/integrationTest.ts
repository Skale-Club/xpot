// The answer of POST /api/xpot/admin/integrations/:provider/test. `message` is
// the English sentence the server logs and keeps as the provider's last test;
// screens word the result from `code` and `params` in the user's language and
// keep the provider's own words (`detail`) behind a "Details" disclosure.

export const INTEGRATION_TEST_CODES = [
  "ok",
  "http_error",
  "missing_secret",
  "location_required",
  "timeout",
  "unreachable",
  "server_error",
  "not_implemented",
  "twilio_ok",
  "twilio_sid_required",
  "twilio_rejected",
  "twilio_unknown_sid",
  "twilio_inactive",
  "twilio_no_sender",
  "twilio_number_check_failed",
  "twilio_number_not_owned",
  "twilio_service_missing",
  "twilio_service_check_failed",
] as const;

export type IntegrationTestCode = (typeof INTEGRATION_TEST_CODES)[number];

export interface IntegrationTestResult {
  ok: boolean;
  /** English, for logs and the kept "last test". */
  message: string;
  code: IntegrationTestCode;
  /** Values the sentence for `code` names: status, field, name, from, service, seconds. */
  params?: Record<string, string | number>;
  /** The provider's own error text, untranslated. */
  detail?: string;
  /** When the result was kept as the provider's last test. */
  testedAt?: string;
}
