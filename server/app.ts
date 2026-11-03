import "express-async-errors";
import express from "express";
import { createServer, type Server } from "http";
import { legacyHostRedirect } from "./canonicalHost.js";
import { registerRoutes } from "./routes.js";
import { apiErrorHandler } from "./errorHandler.js";
import { assertProductionFileStores } from "./lib/files.js";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Fail before accepting traffic if database/session configuration is missing.
 * Production also requires Google identity and both R2 stores, with no managed
 * Auth/Storage fallback; development keeps its explicit Supabase database.
 */
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  const required = ["SESSION_SECRET"];
  if (env.NODE_ENV === "production") {
    required.push("GOOGLE_AUTH_PROJECT_ID", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "GOOGLE_WEB_CLIENT_ID");
    if (env.GOOGLE_AUTH_ENABLED !== "true") throw new Error("Production requires Google phone/Google authentication to be enabled.");
  }
  const hasDatabase = env.NODE_ENV === "development" ? !!env.DEV_DATABASE_URL : !!(env.DATABASE_URL || env.POSTGRES_URL);
  if (!hasDatabase) required.unshift(env.NODE_ENV === "development" ? "DEV_DATABASE_URL" : "DATABASE_URL (or POSTGRES_URL)");
  const missing = required.filter((name) => name === "DATABASE_URL (or POSTGRES_URL)" || !env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment: ${missing.join(", ")}`);
  }
  assertProductionFileStores(env);
}

export async function createApp(): Promise<{ app: express.Express; httpServer: Server }> {
  assertRequiredEnv();
  const app = express();

  // Before anything else: the legacy domain goes to xpot.place.
  app.use(legacyHostRedirect);

  // PLT-02: 50 MB here was fiction — the serverless platform rejects bodies
  // over 4.5 MB before this middleware runs. Voice notes are encoded at 32 kbps
  // and capped at five minutes (~1.6 MB as base64), so 8 MB leaves room and
  // still fails here, with a JSON error, rather than at the edge with none.
  app.use(
    express.json({
      limit: "8mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false, limit: "8mb" }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (req.path.startsWith("/api")) {
        log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
      }
    });
    next();
  });

  const { setupSupabaseAuth } = await import("./auth/supabaseAuth.js");
  await setupSupabaseAuth(app);
  const { registerPhoneAuthRoutes } = await import("./auth/phoneAuth.js");
  registerPhoneAuthRoutes(app);
  const { registerGoogleLoginRoutes } = await import("./auth/googleLogin.js");
  registerGoogleLoginRoutes(app);

  const httpServer = createServer(app);
  await registerRoutes(app);

  // Global error handler (server/errorHandler.ts)
  app.use(apiErrorHandler);

  return { app, httpServer };
}
