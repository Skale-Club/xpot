import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for Supabase auth"
      );
    }

    supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

/**
 * Ensure the Storage buckets exist: "uploads" (public: avatars, branding logos,
 * and photos/voice notes from before they went private) and "private-uploads",
 * where photos and voice notes go when R2 is not configured (server/lib/files.ts).
 * The private one is forced back to private if someone flipped it.
 */
export async function ensureUploadBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: buckets } = await supabase.storage.listBuckets();

  if (!buckets?.some((b) => b.name === "uploads")) {
    const { error } = await supabase.storage.createBucket("uploads", { public: true });
    if (error) throw new Error(`Failed to create "uploads" bucket: ${error.message}`);
  }

  const privateBucket = buckets?.find((b) => b.name === "private-uploads");
  if (!privateBucket) {
    const { error } = await supabase.storage.createBucket("private-uploads", { public: false });
    if (error) throw new Error(`Failed to create "private-uploads" bucket: ${error.message}`);
  } else if (privateBucket.public) {
    const { error } = await supabase.storage.updateBucket("private-uploads", { public: false });
    if (error) throw new Error(`Failed to make "private-uploads" private: ${error.message}`);
  }
}
