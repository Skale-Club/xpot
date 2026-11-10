import { describe, it, expect } from 'vitest';
import { identityFromVerifiedClaims } from '../server/auth/googleIdentity.js';

describe('verified Google Cloud identity attributes', () => {
  it('accepts a verified phone without adopting an application user ID claim', () => {
    expect(identityFromVerifiedClaims({ sub: 'google-uid', phone_number: '+12015550123', firebase: { sign_in_provider: 'phone' }, userId: 'admin' }))
      .toMatchObject({ uid: 'google-uid', phone: '+12015550123', provider: 'phone' });
  });
  it('never adopts an unverified email and does not require email for phone users', () => {
    expect(identityFromVerifiedClaims({ sub: 'g', email: 'admin@example.test', email_verified: false, firebase: { sign_in_provider: 'google.com' } }).email).toBeUndefined();
  });
  it('rejects unsupported providers, tenants and missing verified phone', () => {
    for (const firebase of [{ sign_in_provider: 'password' }, { sign_in_provider: 'google.com', tenant: 'other' }, { sign_in_provider: 'phone' }]) {
      expect(() => identityFromVerifiedClaims({ sub: 'g', firebase })).toThrow();
    }
  });
});
