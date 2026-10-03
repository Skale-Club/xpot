// Minimal in-memory, fixed-window rate limiter (per process). Xpot runs as one
// always-on container, so this is a real throttle; it only bounds abuse of the
// public tag endpoints (analytics writes, pairing attempts) without Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Sweep expired buckets so distinct keys (client IPs) cannot grow the map forever.
const purgeTimer: ReturnType<typeof setInterval> = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60_000);
purgeTimer.unref?.();

/**
 * Normalise a client IP into a rate-limit key: IPv4-mapped IPv6 collapses to
 * the IPv4 address, and IPv6 addresses collapse to their /64 prefix so a
 * single host with a whole /64 cannot mint unlimited keys.
 */
export function normalizeIpKey(ip: string | undefined | null): string {
  if (!ip) return "unknown";
  let value = ip.trim().toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!value.includes(":")) return value;
  value = value.replace(/%.*$/, "");
  let groups: string[];
  if (value.includes("::")) {
    const [head, tail] = value.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  } else {
    groups = value.split(":");
  }
  if (groups.length !== 8) return value;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** True when `key` has gone over `limit` hits in the current window (i.e. reject). */
export function rateLimit(key: string, opts: { limit: number; windowMs: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > opts.limit;
}
