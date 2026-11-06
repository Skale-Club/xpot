import type { Express, Request, Response } from 'express';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { salesReps, users } from '#shared/schema.js';
import { normalizeIpKey, rateLimit } from '../tags/rateLimit.js';
import { isAuthenticated } from './supabaseAuth.js';
import { googleAuthConfig, verifyGoogleIdentity } from './googleIdentity.js';
import { bindGoogleIdentities, googleAccountsOf, IdentityLinkedElsewhereError, unlinkGoogleAccounts } from './googleIdentityStore.js';
import { isSameAuthOrigin } from './sameOrigin.js';

// Settings → Sign-in: a signed-in person adds the way in they don't have yet
// (a phone or a Google account) to the account they are already in. Proving
// the new one here, inside the session, is what links the two; sign-in itself
// never links anything by matching an email.

async function currentUser(req: Request) {
  const [user] = await db.select().from(users).where(eq(users.id, (req.session as any).userId)).limit(1);
  return user ?? null;
}

async function methodsOf(userId: string, phone: string | null) {
  return { phone, google: await googleAccountsOf(userId), canLink: googleAuthConfig().enabled };
}

function guard(req: Request, res: Response): boolean {
  if (!isSameAuthOrigin(req)) { res.status(403).json({ code: 'origin_denied' }); return false; }
  if (rateLimit(`account-links:${normalizeIpKey(req.ip)}`, { limit: 20, windowMs: 15 * 60_000 })) { res.status(429).json({ code: 'rate_limited' }); return false; }
  return true;
}

export function registerAccountLinkRoutes(app: Express) {
  app.get('/api/auth/sign-in-methods', isAuthenticated, async (req, res) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      res.json(await methodsOf(user.id, user.phone));
    } catch (error) {
      console.error('[account-links] read failed', error);
      res.status(500).json({ code: 'generic' });
    }
  });

  // Body: { idToken } from a Google popup or a confirmed phone code.
  app.post('/api/auth/sign-in-methods', isAuthenticated, async (req, res) => {
    try {
      if (!guard(req, res)) return;
      const config = googleAuthConfig();
      if (!config.enabled) return res.status(503).json({ code: 'auth_unavailable' });
      const token = req.body?.idToken;
      if (typeof token !== 'string' || token.length > 16_384) return res.status(400).json({ code: 'invalid_token' });
      let identity;
      try { identity = await verifyGoogleIdentity(token); }
      catch { return res.status(401).json({ code: 'invalid_token' }); }
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const binding = { projectId: config.projectId!, uid: identity.uid, provider: identity.provider, email: identity.email };

      if (identity.provider === 'google.com') {
        await bindGoogleIdentities([binding], user.id);
        return res.json(await methodsOf(user.id, user.phone));
      }

      const phone = identity.phone!;
      const [owner] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, user.id))).limit(1);
      if (owner) return res.status(409).json({ code: 'phone_in_use' });
      await bindGoogleIdentities([binding], user.id);
      if (user.phone !== phone) {
        await db.transaction(async (tx) => {
          // The old number stops signing in: only the phone proven here does.
          await tx.execute(sql`DELETE FROM auth_google_identities WHERE user_id=${user.id} AND subject<>${identity.uid} AND (provider='phone' OR provider IS NULL)`);
          await tx.update(users).set({ phone, updatedAt: new Date() }).where(eq(users.id, user.id));
          // The contact phone follows only when there was none.
          await tx.update(salesReps).set({ phone, updatedAt: new Date() }).where(and(eq(salesReps.userId, user.id), sql`(${salesReps.phone} IS NULL OR ${salesReps.phone} = '')`));
        });
        (req.session as any).phone = phone;
        await new Promise<void>((resolve) => req.session.save(() => resolve()));
      }
      res.json(await methodsOf(user.id, phone));
    } catch (error) {
      if (error instanceof IdentityLinkedElsewhereError) return res.status(409).json({ code: 'linked_elsewhere' });
      console.error('[account-links] link failed', error);
      res.status(500).json({ code: 'generic' });
    }
  });

  app.delete('/api/auth/sign-in-methods/google', isAuthenticated, async (req, res) => {
    try {
      if (!guard(req, res)) return;
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      // Never leave an account with no way in.
      if (!user.phone) return res.status(409).json({ code: 'last_method' });
      await unlinkGoogleAccounts(user.id);
      res.json(await methodsOf(user.id, user.phone));
    } catch (error) {
      console.error('[account-links] unlink failed', error);
      res.status(500).json({ code: 'generic' });
    }
  });
}
