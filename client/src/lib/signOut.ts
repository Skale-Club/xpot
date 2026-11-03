import { queryClient } from "@/lib/queryClient";
import { clearModuleRoutes, forgetSignedIn } from "@/lib/xpot";
import { clearAdminMode } from "@/lib/adminMode";

/** Ends the application and Google sessions and drops per-user cached data. */
export async function signOut(navigate: (path: string) => void) {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new Error('Could not end your session. Please try again.');
  try { await (await import('@/lib/googleIdentity')).signOutGoogleIdentity(); }
  catch { console.warn('Google session cleanup could not finish'); }
  queryClient.clear(); clearModuleRoutes(); forgetSignedIn(); clearAdminMode(); navigate('/');
}
