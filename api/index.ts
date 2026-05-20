// Vercel serverless entry point.
//
// Vercel rewrites everything matching `/api/*` here (see vercel.json), and this
// handler lazily boots the Express app once per cold start. The app instance
// is cached across warm invocations so we only pay the boot cost on the first
// request after a cold start.

import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/app.js";
import type express from "express";

let app: express.Express | null = null;
let initPromise: Promise<express.Express> | null = null;

async function getApp() {
  if (app) return app;

  if (!initPromise) {
    initPromise = createApp()
      .then((result) => {
        app = result.app;
        return app;
      })
      .catch((err) => {
        // Reset so the next request gets a fresh init attempt.
        initPromise = null;
        throw err;
      });
  }

  return initPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expressApp = await getApp();
  return expressApp(req as any, res as any);
}
