// Reasons the server writes itself are codes the app words in the reader's
// language; English defaults on older rows read the same; typed reasons stay.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import assert from "node:assert/strict";
import { LEGACY_TAG_REASONS, systemReasonOf, tagSystemReason, TAG_SYSTEM_REASONS } from "../../shared/tagReasons";
import { pieceScreenMessages } from "../../client/src/i18n/messages/pieceScreen";

test("codes and older English defaults map to a system reason; typed reasons do not", () => {
  assert.equal(systemReasonOf(tagSystemReason("reassigned")), "reassigned");
  assert.equal(systemReasonOf("Configured in the field app"), "configured_field");
  assert.equal(systemReasonOf("Unlinked from the customer page"), "unlinked");
  assert.equal(systemReasonOf("Sale cancelled"), "sale_cancelled");
  assert.equal(systemReasonOf("Customer asked for a new menu"), null);
  assert.equal(systemReasonOf("auto:something_new"), null);
  assert.equal(systemReasonOf(null), null);
  assert.equal(systemReasonOf(""), null);
});

test("every system reason is worded in EN, PT and ES", () => {
  for (const lang of ["en", "pt", "es"] as const) {
    for (const code of TAG_SYSTEM_REASONS) {
      const text = (pieceScreenMessages[lang] as Record<string, string>)[`reason_${code}`];
      assert.ok(text && text.trim(), `${lang}: reason_${code}`);
    }
  }
});

test("the Tags server no longer stores an English default reason", () => {
  const dir = join(__dirname, "../../server/tags");
  // "intake undone" stays: undoBatchIntake looks earlier undos up by it.
  const defaults = Object.keys(LEGACY_TAG_REASONS).filter((reason) => reason !== "intake undone");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const reason of defaults) assert.ok(!text.includes(`"${reason}"`), `${file} still stores "${reason}"`);
  }
});
