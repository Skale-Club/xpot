type DevCodeContext = {
  code: string;
  nodeEnv: string | undefined;
  smsLive: boolean;
};

/** Exposes an OTP only in a local development environment with live SMS off. */
export function devCodeForResponse({ code, nodeEnv, smsLive }: DevCodeContext): string | undefined {
  return nodeEnv === "development" && !smsLive ? code : undefined;
}
