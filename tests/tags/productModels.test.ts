import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { tagsMessages } from "../../client/src/i18n/messages/tags.js";
import { JOURNEY_PRODUCT_LABELS } from "../../shared/tagJourney.js";
import { TAG_PRODUCT_TYPES } from "../../shared/tags.js";

test("the catalog exposes the six physical stand, sign and plate models", () => {
  const physicalModels = [
    "large_stand",
    "small_stand",
    "large_sign",
    "small_sign",
    "large_plate",
    "small_plate",
  ];

  for (const model of physicalModels) {
    assert.ok((TAG_PRODUCT_TYPES as readonly string[]).includes(model), model);
  }
});

test("the first Instagram batch is migrated from custom to Large Plate", () => {
  const migration = readFileSync(new URL("../../migrations/0020_tag_product_models.sql", import.meta.url), "utf8");

  assert.match(migration, /UPDATE\s+"tags"[\s\S]+"product_type"\s*=\s*'large_plate'/i);
  assert.match(migration, /UPDATE\s+"tag_batches"[\s\S]+"product_type"\s*=\s*'large_plate'/i);
  assert.match(migration, /"batch_code"\s*=\s*'IG-2026-001'/i);
  assert.match(migration, /Large Plate[^']*Instagram/i);
});

test("physical model names stay canonical English labels in every UI locale", () => {
  const expected = {
    large_stand: "Large Stand",
    small_stand: "Small Stand",
    large_sign: "Large Sign",
    small_sign: "Small Sign",
    large_plate: "Large Plate",
    small_plate: "Small Plate",
  } as const;

  for (const [model, label] of Object.entries(expected)) {
    assert.equal(JOURNEY_PRODUCT_LABELS[model], label, `journey: ${model}`);
    for (const [locale, messages] of Object.entries(tagsMessages)) {
      assert.equal((messages as Record<string, string>)[`product_${model}`], label, `${locale}: ${model}`);
    }
  }
});
