import { test } from "vitest";
import assert from "node:assert/strict";
import { generateTagCode, generateUniqueCodes } from "../../server/tags/codes.js";
import { normalizeTagCode, TAG_CODE_ALPHABET } from "../../shared/tags.js";

test("generated codes are 8 Crockford symbols and already normalized", () => {
  for (let i = 0; i < 500; i++) {
    const code = generateTagCode();
    assert.equal(code.length, 8);
    assert.ok([...code].every((c) => TAG_CODE_ALPHABET.includes(c)), code);
    assert.equal(normalizeTagCode(code.toLowerCase()), code);
  }
});

test("10k random codes do not repeat", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 10_000; i++) seen.add(generateTagCode());
  assert.equal(seen.size, 10_000);
});

test("collisions against the database and within the batch are regenerated", async () => {
  const sequence = ["AAAAAAAA", "AAAAAAAA", "TAKEN000", "BBBBBBBB", "CCCCCCCC", "DDDDDDDD"];
  let i = 0;
  const generate = () => sequence[i++ % sequence.length];
  const lookups: string[][] = [];
  const codes = await generateUniqueCodes(
    3,
    async (candidates) => {
      lookups.push(candidates);
      return new Set(candidates.filter((c) => c === "TAKEN000"));
    },
    generate,
  );
  assert.equal(codes.length, 3);
  assert.equal(new Set(codes).size, 3);
  assert.ok(!codes.includes("TAKEN000"));
  assert.ok(lookups.length >= 2, "a second round ran after the collision");
});

test("gives up instead of looping forever when every code is taken", async () => {
  await assert.rejects(
    generateUniqueCodes(2, async (c) => new Set(c), generateTagCode, 3),
    /could not generate/,
  );
});
