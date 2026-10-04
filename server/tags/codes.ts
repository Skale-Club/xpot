import crypto from "crypto";
import { encodeTagCode, TAG_CODE_LENGTH } from "#shared/tags.js";

/** One cryptographically random public code (8 Crockford Base32 symbols ≈ 40 bits). */
export function generateTagCode(length = TAG_CODE_LENGTH): string {
  return encodeTagCode(crypto.randomBytes(length), length);
}

/**
 * `count` distinct codes that `findExisting` reports as unused. Collisions —
 * within the set or against the database — are regenerated, a bounded number
 * of times. `generate` is injectable for tests.
 */
export async function generateUniqueCodes(
  count: number,
  findExisting: (codes: string[]) => Promise<Set<string>>,
  generate: () => string = generateTagCode,
  maxRounds = 10,
): Promise<string[]> {
  const accepted = new Set<string>();
  for (let round = 0; round < maxRounds && accepted.size < count; round++) {
    const candidates = new Set<string>();
    let guard = 0;
    while (candidates.size < count - accepted.size && guard++ < count * 20) {
      const code = generate();
      if (!accepted.has(code)) candidates.add(code);
    }
    const taken = await findExisting(Array.from(candidates));
    for (const code of Array.from(candidates)) {
      if (!taken.has(code)) accepted.add(code);
    }
  }
  if (accepted.size < count) throw new Error("could not generate enough unique tag codes");
  return Array.from(accepted);
}
