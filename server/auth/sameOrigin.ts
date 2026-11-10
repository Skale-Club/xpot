import type { Request } from 'express';

export function isSameAuthOrigin(req: Request): boolean {
  const expected = process.env.NODE_ENV === 'production'
    ? new URL(process.env.XPOT_PUBLIC_URL!).origin : `${req.protocol}://${req.get('host')}`;
  return req.get('origin') === expected;
}
