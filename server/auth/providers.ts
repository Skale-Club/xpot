type AuthIdentity = { provider?: unknown };

type AuthUser = {
  app_metadata?: Record<string, unknown>;
  identities?: AuthIdentity[] | null;
};

/** Google authentication is paused; linked Google identities cannot create a new Xpot session. */
export function usesGoogleAuth(user: AuthUser): boolean {
  const provider = user.app_metadata?.provider;
  const providers = user.app_metadata?.providers;
  return provider === "google"
    || (Array.isArray(providers) && providers.includes("google"))
    || Boolean(user.identities?.some((identity) => identity.provider === "google"));
}
