import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser } from "./middleware.js";

// Per-user (tenant) Xphere integration config — each authenticated user manages
// their own credentials in the panel. Mounted under /api/xpot.
export function createXphereRouter() {
  const router = Router();
  router.use(requireXpotUser);

  function genInboundKey() {
    return `xpot_${randomBytes(24).toString("base64url")}`;
  }

  // Never echo the outbound xph_ token back; surface only whether it is set.
  function present(integration: Awaited<ReturnType<typeof storage.getXphereIntegrationByUserId>>) {
    return {
      inboundApiKey: integration?.inboundApiKey ?? null,
      apiUrl: integration?.apiUrl ?? "https://xphere.app",
      apiKeySet: Boolean(integration?.apiKey),
      isEnabled: Boolean(integration?.isEnabled),
    };
  }

  router.get("/xphere/config", async (req: Request, res: Response) => {
    const actor = (req as any).xpotActor;
    const integration = await storage.getXphereIntegrationByUserId(actor.user.userId);
    res.json(present(integration));
  });

  router.put("/xphere/config", async (req: Request, res: Response) => {
    const actor = (req as any).xpotActor;
    const input = z
      .object({
        apiKey: z.string().trim().nullable().optional(),
        apiUrl: z.string().url().nullable().optional(),
        isEnabled: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await storage.getXphereIntegrationByUserId(actor.user.userId);
    const data: Record<string, unknown> = {};
    if (input.apiKey !== undefined) data.apiKey = input.apiKey || null;
    if (input.apiUrl !== undefined) data.apiUrl = input.apiUrl || "https://xphere.app";
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    // Generate the inbound key on first save so the user can configure Xphere.
    if (!existing?.inboundApiKey) data.inboundApiKey = genInboundKey();

    const saved = await storage.upsertXphereIntegration(actor.user.userId, data);
    res.json(present(saved));
  });

  router.post("/xphere/config/rotate-inbound-key", async (req: Request, res: Response) => {
    const actor = (req as any).xpotActor;
    const saved = await storage.upsertXphereIntegration(actor.user.userId, {
      inboundApiKey: genInboundKey(),
    });
    res.json(present(saved));
  });

  return router;
}
