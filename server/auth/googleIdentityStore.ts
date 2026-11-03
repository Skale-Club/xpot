import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export interface IdentityBinding { projectId: string; uid: string }

export async function userIdForGoogleIdentity(identity: IdentityBinding): Promise<string | null> {
  const result = await db.execute(sql`SELECT user_id FROM auth_google_identities WHERE project_id=${identity.projectId} AND subject=${identity.uid}`);
  return result.rows[0]?.user_id as string | undefined ?? null;
}

/** Call only after proof of ownership of the app account (verified phone). */
export async function bindGoogleIdentities(identities: IdentityBinding[], userId: string) {
  const sorted = Array.from(new Map(identities.map(value => [value.projectId + '/' + value.uid, value])).values())
    .sort((a, b) => (a.projectId + '/' + a.uid).localeCompare(b.projectId + '/' + b.uid));
  await db.transaction(async (tx) => {
    for (const identity of sorted) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity.projectId + '/' + identity.uid},0))`);
      const result = await tx.execute(sql`SELECT user_id FROM auth_google_identities WHERE project_id=${identity.projectId} AND subject=${identity.uid}`);
      if (result.rows[0] && result.rows[0].user_id !== userId) throw new Error('Identity is already linked to another account');
      await tx.execute(sql`INSERT INTO auth_google_identities(project_id,subject,user_id) VALUES(${identity.projectId},${identity.uid},${userId}) ON CONFLICT DO NOTHING`);
    }
  });
}
