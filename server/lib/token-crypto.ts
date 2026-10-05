// server/lib/token-crypto.ts
//
// Ported from xkedule/server/lib/token-crypto.ts (same envelope as Skale Club).
// The salt differs per product on purpose: the same SESSION_SECRET must not
// derive the same key in two codebases.
//
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM for secrets stored at rest: the api_key column of
// chat_integrations and integration_settings (AI keys, Twilio Auth Token,
// GoHighLevel, Google Places...).
//
// Every caller shares the SAME key. Set TOKEN_ENCRYPTION_KEY explicitly: with
// only the SESSION_SECRET-derived fallback, rotating SESSION_SECRET makes every
// stored secret undecryptable at once.
//
// Envelope: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`. A value WITHOUT the `v1:`
// prefix is legacy plaintext and passes through decrypt unchanged (it gets
// encrypted on the next write). A `v1:` value that fails authentication throws.

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_DERIVATION_SALT = "xpot-token-crypto-v1";

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const asHex = /^[0-9a-fA-F]{64}$/.test(explicit) ? Buffer.from(explicit, "hex") : null;
    const asB64 = (() => {
      try {
        const b = Buffer.from(explicit, "base64");
        return b.length === 32 ? b : null;
      } catch {
        return null;
      }
    })();
    const buf = asHex ?? asB64;
    if (!buf || buf.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as hex (64 chars) or base64.");
    }
    cachedKey = buf;
    return cachedKey;
  }
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    throw new Error("Token encryption requires TOKEN_ENCRYPTION_KEY or SESSION_SECRET to be set.");
  }
  console.warn(
    "[token-crypto] TOKEN_ENCRYPTION_KEY is not set; secrets at rest are keyed from SESSION_SECRET. Set TOKEN_ENCRYPTION_KEY (32 bytes, hex or base64) so rotating SESSION_SECRET does not invalidate stored secrets.",
  );
  cachedKey = scryptSync(sessionSecret, KEY_DERIVATION_SALT, 32);
  return cachedKey;
}

/** Tests only: forget the cached key so a changed env is picked up. */
export function resetTokenCryptoKeyForTests(): void {
  cachedKey = null;
}

export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

export function encryptToken(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptToken(value: string): string {
  if (!isEncryptedToken(value)) return value;
  const parts = value.split(":");
  if (parts.length !== 4) throw new Error("Malformed encrypted token envelope");
  const [, ivB64, tagB64, ctB64] = parts;
  const key = resolveKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Write side: encrypt a non-empty string unless it already is; null/undefined/"" pass through. */
export function encryptSecret<T extends string | null | undefined>(value: T): T {
  return (typeof value === "string" && value && !isEncryptedToken(value) ? encryptToken(value) : value) as T;
}

let decryptFailureLogged = false;
/** Read side: decrypt, and on an undecryptable value (rotated key) log once and return null instead of throwing. */
export function decryptSecret<T extends string | null | undefined>(value: T): T | null {
  if (typeof value !== "string" || !value) return value;
  try {
    return decryptToken(value) as T;
  } catch (err) {
    if (!decryptFailureLogged) {
      decryptFailureLogged = true;
      console.error("[token-crypto] a stored secret could not be decrypted (wrong or rotated key); treating it as missing", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
