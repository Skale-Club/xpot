import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../../storage.js";

// Server-to-server inbound API for external systems (Xphere) to push prospect
// records in for field visits. Authenticated with a shared Bearer secret
// (XPHERE_INBOUND_API_KEY) rather than a user session.
export function createInboundRouter() {
  const router = Router();

  function requireInboundKey(req: Request, res: Response, next: NextFunction) {
    const expected = process.env.XPHERE_INBOUND_API_KEY;
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!expected || !token || token !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }

  // POST /inbound/prospects
  // Body: { leads: [{ xphereId, xphereKind, name, email?, phone?, address? }] }
  router.post("/inbound/prospects", requireInboundKey, async (req: Request, res: Response) => {
    const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
    if (leads.length === 0) {
      return res.status(400).json({ error: "leads must be a non-empty array" });
    }

    let sent = 0;
    for (const l of leads) {
      const name = typeof l?.name === "string" && l.name.trim() ? l.name.trim() : null;
      const xphereId = typeof l?.xphereId === "string" ? l.xphereId : null;
      if (!name || !xphereId) continue;
      const xphereKind = l?.xphereKind === "account" ? "account" : "contact";

      try {
        const lead = await storage.createSalesLead({
          name,
          email: typeof l?.email === "string" ? l.email : null,
          phone: typeof l?.phone === "string" ? l.phone : null,
          source: "xphere",
          status: "prospect",
          xphereRef: `${xphereKind}:${xphereId}`,
        } as Parameters<typeof storage.createSalesLead>[0]);

        const address =
          typeof l?.address === "string" && l.address.trim() ? l.address.trim() : null;
        if (address) {
          await storage.createSalesLeadLocation({
            leadId: lead.id,
            label: "Main",
            addressLine1: address,
            isPrimary: true,
          } as Parameters<typeof storage.createSalesLeadLocation>[0]);
        }

        sent += 1;
      } catch (err) {
        console.error("[xpot inbound] create lead failed:", err);
      }
    }

    res.json({ sent });
  });

  return router;
}
