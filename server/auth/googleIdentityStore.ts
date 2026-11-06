import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export interface IdentityBinding { projectId: string; uid: string; provider?: 'google.com' | 'phone'; email?: string }

export class IdentityLinkedElsewhereError extends Error {
  constructor() { super('Identity is already linked to another account'); }
}

export async function userIdForGoogleIdentity(identity: IdentityBinding): Promise<string | null> {
  const result = await db.execute(sql`SELECT user_id FROM auth_google_identities WHERE project_id=${identity.projectId} AND subject=${identity.uid}`);
  return result.rows[0]?.user_id as string | undefined ?? null;
}

/** Call only after proof that the person owns both the identity and the app account. */
export async function bindGoogleIdentities(identities: IdentityBinding[], userId: string) {
  const sorted = Array.from(new Map(identities.map(value => [value.projectId + '/' + value.uid, value])).values())
    .sort((a, b) => (a.projectId + '/' + a.uid).localeCompare(b.projectId + '/' + b.uid));
  await db.transaction(async (tx) => {
    const bind = async (identity: IdentityBinding) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity.projectId + '/' + identity.uid},0))`);
      const result = await tx.execute(sql`SELECT user_id FROM auth_google_identities WHERE project_id=${identity.projectId} AND subject=${identity.uid}`);
      if (result.rows[0] && result.rows[0].user_id !== userId) throw new IdentityLinkedElsewhereError();
      await tx.execute(sql`INSERT INTO auth_google_identities(project_id,subject,user_id,provider,email)
        VALUES(${identity.projectId},${identity.uid},${userId},${identity.provider ?? null},${identity.email ?? null})
        ON CONFLICT (project_id,subject) DO UPDATE SET
          provider=COALESCE(EXCLUDED.provider,auth_google_identities.provider),
          email=COALESCE(EXCLUDED.email,auth_google_identities.email)`);
    };
    // Acquire locks in a stable sequence so concurrent phone/Google linking cannot deadlock.
    await sorted.reduce((previous, identity) => previous.then(() => bind(identity)), Promise.resolve());
  });
}

/** The Google accounts (not phone identities) that sign in to this user. */
export async function googleAccountsOf(userId: string): Promise<Array<{ email: string | null }>> {
  const result = await db.execute(sql`SELECT email FROM auth_google_identities WHERE user_id=${userId} AND provider='google.com' ORDER BY created_at`);
  return result.rows.map(row => ({ email: (row.email as string | null) ?? null }));
}

export async function unlinkGoogleAccounts(userId: string) {
  await db.execute(sql`DELETE FROM auth_google_identities WHERE user_id=${userId} AND provider='google.com'`);
}
