import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser } from "./middleware.js";

export const XPHERE_DEFAULT_URL = "https://xphere.app";

/** The key Xphere sends as its Bearer token to /api/xpot/inbound/* (inbound.ts). */
export function genInboundKey() {
  return `xpot_${randomBytes(24).toString("base64url")}`;
}

// An empty API URL means "the default address"; only a typed one must be a URL.
export const xphereConfigSchema = z.object({
  apiKey: z.string().trim().nullable().optional(),
  apiUrl: z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? null : value),
    z.string().trim().url().max(500).nullable().optional(),
  ),
  isEnabled: z.boolean().optional(),
});

// Never echo the outbound xph_ token back; surface only whether it is set.
export function presentXphere(integration: Awaited<ReturnType<typeof storage.getXphereIntegrationByUserId>>) {
  return {
    inboundApiKey: integration?.inboundApiKey ?? null,
    apiUrl: integration?.apiUrl ?? XPHERE_DEFAULT_URL,
    apiKeySet: Boolean(integration?.apiKey),
    isEnabled: Boolean(integration?.isEnabled),
  };
}

// Per-user (tenant) Xphere integration config — each authenticated user's own
// credentials. Mounted under /api/xpot. The screens use the admin routes
// (admin.ts, the global admin sets everyone's); these stay for API clients.
export function createXphereRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/xphere/config", async (req: Request, res: Response) => {
    const actor = (req as any).xpotActor;
    const integration = await storage.getXphereIntegrationByUserId(actor.user.userId);
    res.json(presentXphere(integration));
  });

  router.put("/xphere/config", async (req: Request, res: Response) => {
    const actor = (req as any).xpotActor;
    const input = xphereConfigSchema.parse(req.body);

    const existing = await storage.getXphereIntegrationByUserId(actor.user.userId);
    const data: Record<string, unknown> = {};
    if (input.apiKey !== undefined) data.apiKey = input.apiKey || null;
    if (input.apiUrl !== undefined) data.apiUrl = input.apiUrl || XPHERE_DEFAULT_URL;
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    // Generate the inbound key on first save so the user can configure Xphere.
    if (!existing?.inboundApiKey) data.inboundApiKey = genInboundKey();

    const saved = await storage.upsertXphereIntegration(actor.user.userId, data);
    res.json(presentXphere(saved));
  });

  router.post("/xphere/config/rotate-inbound-key", async (req: Request, res: Response) => {
    const actor = (req as any).xpotActor;
    const saved = await storage.upsertXphereIntegration(actor.user.userId, {
      inboundApiKey: genInboundKey(),
    });
    res.json(presentXphere(saved));
  });

  return router;
}
