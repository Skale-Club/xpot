import "express-async-errors";
import { ZodError } from "zod";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes.js";

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

export async function createApp(): Promise<{ app: express.Express; httpServer: Server }> {
  const app = express();

  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false, limit: "50mb" }));

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

  const httpServer = createServer(app);
  await registerRoutes(app);

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ message: "Validation error", errors: err.errors });
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ message: (err as Error).message || "Internal server error" });
  });

  return { app, httpServer };
}
