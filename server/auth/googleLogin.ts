import type { Express, Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '#shared/schema.js';
import { normalizeIpKey, rateLimit } from '../tags/rateLimit.js';
import { googleAuthConfig, verifyGoogleIdentity } from './googleIdentity.js';
import { bindGoogleIdentities, userIdForGoogleIdentity, type IdentityBinding } from './googleIdentityStore.js';
import { accessOf, findUserByPhone, rememberVerifiedPhone, startSession } from './phoneAuth.js';
import { isSameAuthOrigin } from './sameOrigin.js';

type PendingGoogle = IdentityBinding & { at: number };
function sessionSave(req: Request) { return new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve())); }
function newSession(req: Request) { return new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve())); }

export function registerGoogleLoginRoutes(app: Express) {
  app.post('/api/auth/identity', async (req, res) => {
    try {
      if (!isSameAuthOrigin(req)) return res.status(403).json({ code: 'origin_denied' });
      if (rateLimit(`google-login:${normalizeIpKey(req.ip)}`, { limit: 30, windowMs: 15 * 60_000 })) return res.status(429).json({ code: 'rate_limited' });
      const config = googleAuthConfig();
      if (!config.enabled) return res.status(503).json({ code: 'auth_unavailable' });
      const token = req.body?.idToken;
      if (typeof token !== 'string' || token.length > 16_384) return res.status(400).json({ code: 'invalid_token' });
      let identity;
      try { identity = await verifyGoogleIdentity(token); }
      catch { return res.status(401).json({ code: 'invalid_token' }); }
      const binding = { projectId: config.projectId!, uid: identity.uid };
      const linkedId = await userIdForGoogleIdentity(binding);
      let user = linkedId ? (await db.select().from(users).where(eq(users.id, linkedId)).limit(1))[0] : null;
      const pending = (req.session as any).pendingGoogle as PendingGoogle | undefined;
      const bindings = [binding];
      if (identity.provider === 'phone' && pending && Date.now() - pending.at < 10 * 60_000) {
        bindings.push({ projectId: pending.projectId, uid: pending.uid });
      }
      if (!user && identity.phone) user = await findUserByPhone(identity.phone);
      if (!user && !identity.phone) {
        // Never claim an existing app account merely by matching its email.
        (req.session as any).pendingGoogle = { ...binding, at: Date.now() };
        await sessionSave(req);
        return res.json({ status: 'phone_required' });
      }
      if (!user) {
        await newSession(req);
        await rememberVerifiedPhone(req, identity.phone!, bindings);
        return res.json({ status: 'new' });
      }
      await bindGoogleIdentities(bindings, user.id);
      const status = await accessOf(user);
      await newSession(req);
      if (status === 'active') await startSession(req, user);
      if (status === 'new' && user.phone) await rememberVerifiedPhone(req, user.phone, bindings);
      // Pending/blocked users do not receive an authenticated application session.
      res.json({ status });
    } catch {
      console.error('[google-login] Account/session provisioning failed');
      res.status(500).json({ code: 'auth_unavailable' });
    }
  });
}
