import "dotenv/config";
import * as Sentry from "@sentry/node";

/**
 * Must be server/index.ts's first import, so Sentry sees http before anything
 * loads it. Errors only, no tracing. What reaches Sentry is what
 * recordSystemEvent forwards (observability/events.ts), not express's own errors:
 * a ZodError answers 400 and is nobody's bug. Without SENTRY_DSN it does nothing.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.SOURCE_COMMIT || undefined,
});
