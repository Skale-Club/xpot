import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient> | null = null;

async function initSupabase(): Promise<SupabaseClient> {
  if (supabaseInstance) return supabaseInstance;
  
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const response = await fetch('/api/supabase-config');
    const config = await response.json();
    
    if (!config.url || !config.anonKey) {
      throw new Error('Supabase configuration not available');
    }
    
    supabaseInstance = createClient(config.url, config.anonKey);
    return supabaseInstance;
  })();
  
  return initPromise;
}

export { initSupabase };

export const getSupabase = () => {
  if (!supabaseInstance) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return supabaseInstance;
};
