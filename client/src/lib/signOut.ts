import { queryClient } from "@/lib/queryClient";

/** Ends the Supabase and server sessions, drops cached data and goes to "/". */
export async function signOut(navigate: (path: string) => void) {
  try {
    const { initSupabase } = await import("@/lib/supabase");
    const supabase = await initSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Failed to sign out of Supabase:", err);
  }
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  queryClient.clear();
  navigate("/");
}
