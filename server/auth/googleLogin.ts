import type { Express, Request } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '#shared/schema.js';
import { normalizeIpKey, rateLimit } from '../tags/rateLimit.js';
import { googleAuthConfig, verifyGoogleIdentity } from './googleIdentity.js';
import { bindGoogleIdentities, userIdForGoogleIdentity, type IdentityBinding } from './googleIdentityStore.js';
import { accessOf, findUserByPhone, rememberApplicant, startSession } from './phoneAuth.js';
import { isSameAuthOrigin } from './sameOrigin.js';

function newSession(req: Request) { return new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve())); }

async function findAccount(binding: IdentityBinding, phone?: string) {
  const linkedId = await userIdForGoogleIdentity(binding);
  if (linkedId) {
    const user = (await db.select().from(users).where(eq(users.id, linkedId)).limit(1))[0];
    if (user) return user;
  }
  if (phone) return findUserByPhone(phone);
  // A Google account whose email Google verified opens the one account that
  // already carries that email; never when two share it.
  if (binding.provider === 'google.com' && binding.email) {
    const matches = await db.select().from(users).where(sql`lower(${users.email}) = lower(${binding.email})`).limit(2);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// Phone and Google are two separate ways in. Each finds the account it is
// linked to; a Google account Google verified also opens the one account with
// the same email. Neither needs the other. Linking one to the other happens inside
// the app, in Settings → Sign-in (server/auth/accountLinks.ts).
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
      catch (error) {
        // The reason only (expired, wrong audience, unreachable keys), never the token.
        console.warn('[google-login] token rejected:', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        return res.status(401).json({ code: 'invalid_token' });
      }
      const binding: IdentityBinding = { projectId: config.projectId!, uid: identity.uid, provider: identity.provider, email: identity.email };
      const user = await findAccount(binding, identity.phone);
      if (!user) {
        // A new person: phone or Google alone opens the application.
        await newSession(req);
        await rememberApplicant(req, { phone: identity.phone, email: identity.email, name: identity.name }, [binding]);
        return res.json({ status: 'new' });
      }
      await bindGoogleIdentities([binding], user.id);
      const status = await accessOf(user);
      await newSession(req);
      if (status === 'active') await startSession(req, user);
      if (status === 'new') await rememberApplicant(req, { phone: user.phone ?? identity.phone, email: identity.email, name: identity.name }, [binding]);
      // Pending/blocked users do not receive an authenticated application session.
      res.json({ status });
    } catch {
      console.error('[google-login] Account/session provisioning failed');
      res.status(500).json({ code: 'auth_unavailable' });
    }
  });
}
