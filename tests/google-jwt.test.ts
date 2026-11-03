import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

const state = vi.hoisted(() => ({ resolve: undefined as any }));
vi.mock('jose', async (original) => ({ ...await original<typeof import('jose')>(), createRemoteJWKSet: () => (...args: any[]) => state.resolve(...args) }));
import { verifyGoogleIdentity } from '../server/auth/googleIdentity.js';

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
beforeAll(async () => {
 const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey;
 state.resolve = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256' }] });
});
beforeEach(() => {
 for (const [key,value] of Object.entries({ GOOGLE_AUTH_ENABLED:'true', GOOGLE_AUTH_PROJECT_ID:'skaleclub', FIREBASE_API_KEY:'test', FIREBASE_AUTH_DOMAIN:'test.firebaseapp.com', GOOGLE_WEB_CLIENT_ID:'test.apps.googleusercontent.com' })) vi.stubEnv(key,value);
});
afterEach(() => vi.unstubAllEnvs());

async function token(options: { issuer?: string; audience?: string; expired?: boolean; authTime?: number } = {}) {
 return new SignJWT({ auth_time: options.authTime ?? Math.floor(Date.now()/1000), phone_number:'+12015550123', firebase:{ sign_in_provider:'phone' } })
  .setProtectedHeader({ alg:'RS256', kid:'test-key' }).setSubject('verified-uid')
  .setIssuer(options.issuer ?? 'https://securetoken.google.com/skaleclub').setAudience(options.audience ?? 'skaleclub')
  .setIssuedAt().setExpirationTime(options.expired ? '0s' : '1h').sign(privateKey);
}
describe('Google token cryptographic boundary', () => {
 it('accepts a signed token for the configured project', async () => { expect(await verifyGoogleIdentity(await token())).toMatchObject({ uid:'verified-uid',phone:'+12015550123' }); });
 it('rejects a different project, issuer, expiration and tampered signature', async () => {
  for (const value of [await token({ audience:'other' }), await token({issuer:'https://securetoken.google.com/other'}), await token({expired:true})]) await expect(verifyGoogleIdentity(value)).rejects.toThrow();
  const value = await token(); const parts=value.split('.'); parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
  await expect(verifyGoogleIdentity(parts.join('.'))).rejects.toThrow();
 });
 it('refuses tokens while the migration flag is off', async () => { vi.stubEnv('GOOGLE_AUTH_ENABLED','false'); await expect(verifyGoogleIdentity(await token())).rejects.toThrow(); });
});
