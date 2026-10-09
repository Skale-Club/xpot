// Private files: voice notes and business photos.
//
// These used to sit in the public Supabase bucket "uploads", so anyone holding
// a link could open them forever. They now go to a PRIVATE store and the DB
// keeps a reference, never a URL:
//
//   "r2:audio/12/visit_40_1730000000000.webm"      Cloudflare R2 (preferred)
//   "supabase:photos/12/lead_7_1730000000000.jpg"  private Supabase bucket (fallback)
//   "https://…/storage/v1/object/public/uploads/…" legacy public URL, until
//                                                  scripts/migrate-private-files.ts moves it
//
// The browser asks GET /api/xpot/files?ref=… (server/routes/xpot/files.ts),
// which checks access to the lead or visit holding the reference and redirects
// to a signed URL that lives SIGNED_URL_TTL_SECONDS.
//
// New uploads go to R2 when R2_* is set, else to the private Supabase bucket.
// The prefix in each reference says where it lives, so switching backends
// never strands a row (the migration script moves them over).
//
// Avatars and branding logos stay in the public "uploads" bucket: they are
// shown all over the app chrome and on public pages, and a profile picture is
// something the person chose to show. Avatars are deleted with the account.

import { AwsClient } from "aws4fetch";
import { getSupabaseAdmin } from "./supabase.js";

export const SIGNED_URL_TTL_SECONDS = 300;
/** Public bucket: avatars, branding, and legacy photos/audio not yet migrated. */
export const PUBLIC_BUCKET = "uploads";
/** Private Supabase bucket, used when R2 is not configured. */
export const PRIVATE_SUPABASE_BUCKET = "private-uploads";

export type Backend = "r2" | "supabase";

export interface FileStore {
  backend: Backend;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Missing objects are not an error. */
  remove(keys: string[]): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  /** Every key under a "folder/" prefix (one level: our layout is kind/repId/file). */
  list(prefix: string): Promise<string[]>;
  /** Raw bytes, for the migration script. */
  get(key: string): Promise<Uint8Array>;
}

// ─── References ──────────────────────────────────────────────────────────────

export type FileRef =
  | { kind: "stored"; backend: Backend; key: string }
  | { kind: "legacy"; url: string; publicPath: string | null };

/** Keys are always kind/repId/file — nothing else is ever signed or deleted. */
const KEY_PATTERN = /^(audio|photos)\/\d+\/[A-Za-z0-9._-]+$/;

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function makeRef(backend: Backend, key: string): string {
  return `${backend}:${key}`;
}

/** Path inside the public "uploads" bucket for a legacy Supabase public URL. */
export function legacyPublicPath(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/public\/uploads\/([^?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseRef(ref: string | null | undefined): FileRef | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return { kind: "legacy", url: ref, publicPath: legacyPublicPath(ref) };
  const match = ref.match(/^(r2|supabase):(.+)$/);
  if (!match || !isValidKey(match[2])) return null;
  return { kind: "stored", backend: match[1] as Backend, key: match[2] };
}

/** Which rep uploaded the file, from its path (audio/12/…, photos/12/…, avatars/12/…). */
export function uploaderRepId(ref: string): number | null {
  const parsed = parseRef(ref);
  const path = parsed?.kind === "stored" ? parsed.key : parsed?.publicPath;
  const match = path?.match(/^(?:audio|photos|avatars)\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

// ─── Backends ────────────────────────────────────────────────────────────────

function r2Config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !(R2_ACCOUNT_ID || R2_ENDPOINT)) return null;
  const endpoint = (R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  return { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET, endpoint };
}

export function isR2Configured(): boolean {
  return r2Config() !== null;
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const xmlDecode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** R2 through its S3 API, signed with SigV4. Exported for tests. */
export function createR2Store(config: NonNullable<ReturnType<typeof r2Config>>): FileStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const bucketUrl = `${config.endpoint}/${config.bucket}`;
  const objectUrl = (key: string) => `${bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const fail = async (what: string, res: Response) => {
    throw new Error(`R2 ${what} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  };

  return {
    backend: "r2",
    async put(key, body, contentType) {
      const res = await client.fetch(objectUrl(key), { method: "PUT", body, headers: { "Content-Type": contentType } });
      if (!res.ok) await fail(`upload of ${key}`, res);
    },
    async remove(keys) {
      for (const key of keys) {
        const res = await client.fetch(objectUrl(key), { method: "DELETE" });
        if (!res.ok && res.status !== 404) await fail(`delete of ${key}`, res);
      }
    },
    async signedUrl(key, ttlSeconds) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
      const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
      return signed.url;
    },
    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const url = new URL(bucketUrl);
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", prefix);
        if (token) url.searchParams.set("continuation-token", token);
        const res = await client.fetch(url.toString());
        if (!res.ok) await fail(`list of ${prefix}`, res);
        const xml = await res.text();
        for (const m of Array.from(xml.matchAll(/<Key>([^<]*)<\/Key>/g))) keys.push(xmlDecode(m[1]));
        token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1];
        token = token ? xmlDecode(token) : undefined;
      } while (token);
      return keys;
    },
    async get(key) {
      const res = await client.fetch(objectUrl(key));
      if (!res.ok) await fail(`download of ${key}`, res);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

/** A Supabase Storage bucket (the private one, or the legacy public one for cleanup). */
export function createSupabaseStore(bucket: string): FileStore {
  const from = () => getSupabaseAdmin().storage.from(bucket);
  return {
    backend: "supabase",
    async put(key, body, contentType) {
      const { error } = await from().upload(key, body, { contentType, upsert: false });
      if (error) throw error;
    },
    async remove(keys) {
      if (!keys.length) return;
      const { error } = await from().remove(keys);
      if (error) throw error;
    },
    async signedUrl(key, ttlSeconds) {
      const { data, error } = await from().createSignedUrl(key, ttlSeconds);
      if (error || !data) throw error ?? new Error(`Could not sign ${key}`);
      return data.signedUrl;
    },
    async list(prefix) {
      const folder = prefix.replace(/\/+$/, "");
      const keys: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await from().list(folder, { limit: 1000, offset });
        if (error) throw error;
        // Entries without an id are sub-folders; our layout has none below repId.
        keys.push(...(data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`));
        if (!data || data.length < 1000) break;
      }
      return keys;
    },
    async get(key) {
      const { data, error } = await from().download(key);
      if (error || !data) throw error ?? new Error(`Could not download ${key}`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

// Tests swap the backends for in-memory doubles.
let overrides: Partial<Record<Backend | "public", FileStore | null>> | null = null;
export function setFileStoresForTests(stores: typeof overrides) {
  overrides = stores;
}

/** The store a reference's prefix points at, or null when that backend isn't configured. */
export function storeFor(backend: Backend): FileStore | null {
  if (overrides && backend in overrides) return overrides[backend] ?? null;
  if (backend === "r2") {
    const config = r2Config();
    return config ? createR2Store(config) : null;
  }
  return isSupabaseConfigured() ? createSupabaseStore(PRIVATE_SUPABASE_BUCKET) : null;
}

/** The legacy public bucket (avatars, unmigrated photos/audio). */
export function publicStore(): FileStore | null {
  if (overrides && "public" in overrides) return overrides.public ?? null;
  return isSupabaseConfigured() ? createSupabaseStore(PUBLIC_BUCKET) : null;
}

/** Where new private uploads go: R2 when configured, else the private Supabase bucket. */
export function activeStore(): FileStore | null {
  return storeFor("r2") ?? storeFor("supabase");
}

// ─── Operations ──────────────────────────────────────────────────────────────

/** Upload a private file; returns the reference to keep in the DB. */
export async function putPrivateFile(key: string, body: Uint8Array, contentType: string): Promise<string> {
  if (!isValidKey(key)) throw new Error(`Invalid file key: ${key}`);
  const store = activeStore();
  if (!store) throw new FileStorageUnavailableError();
  await store.put(key, body, contentType);
  return makeRef(store.backend, key);
}

export class FileStorageUnavailableError extends Error {
  constructor() {
    super("Storage not configured");
  }
}

/** A URL the browser can open now: signed for stored files, as-is for legacy public ones. */
export async function resolveFileUrl(ref: string): Promise<string | null> {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  if (parsed.kind === "legacy") return parsed.url;
  const store = storeFor(parsed.backend);
  if (!store) return null;
  return store.signedUrl(parsed.key, SIGNED_URL_TTL_SECONDS);
}

/**
 * Best-effort delete of stored files after their row is gone. Never throws:
 * the DB change already happened, so a storage hiccup is logged, not surfaced.
 * Legacy public URLs are removed from the public bucket too.
 */
export async function discardFiles(refs: Array<string | null | undefined>, context: string): Promise<{ deleted: number; failed: number }> {
  const groups = new Map<FileStore, string[]>();
  let failed = 0;
  for (const ref of Array.from(new Set(refs.filter((r): r is string => Boolean(r))))) {
    const parsed = parseRef(ref);
    const store = parsed?.kind === "stored" ? storeFor(parsed.backend) : parsed?.publicPath ? publicStore() : null;
    const key = parsed?.kind === "stored" ? parsed.key : parsed?.publicPath;
    if (!store || !key) {
      // Not ours (an external URL) or the backend is gone: nothing we can delete.
      if (parsed?.kind === "stored") {
        failed++;
        console.error(`[files] ${context}: no ${parsed.backend} store configured; ${ref} left behind`);
      }
      continue;
    }
    groups.set(store, [...(groups.get(store) ?? []), key]);
  }

  let deleted = 0;
  for (const [store, keys] of Array.from(groups)) {
    try {
      await store.remove(keys);
      deleted += keys.length;
    } catch (err) {
      failed += keys.length;
      console.error(`[files] ${context}: could not delete ${keys.length} file(s) from ${store.backend}:`, (err as Error).message, keys);
    }
  }
  return { deleted, failed };
}

/** Delete everything a rep ever uploaded (audio, photos, avatar), in every store. Best-effort. */
export async function sweepRepFiles(repId: number, context: string): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const stores = [storeFor("r2"), storeFor("supabase"), publicStore()].filter((s): s is FileStore => Boolean(s));
  for (const store of stores) {
    for (const prefix of [`audio/${repId}/`, `photos/${repId}/`, `avatars/${repId}/`]) {
      try {
        const keys = await store.list(prefix);
        if (keys.length) await store.remove(keys);
        deleted += keys.length;
      } catch (err) {
        failed++;
        console.error(`[files] ${context}: could not clear ${prefix} in ${store.backend}:`, (err as Error).message);
      }
    }
  }
  return { deleted, failed };
}
