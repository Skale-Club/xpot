-- Tags › Shop in more than one language (docs/simplicity/admin-idiomas.md, ID-07). An entry's title, description and
-- "what's inside" were one text, so a reseller reading Xpot in Portuguese or Spanish read the shop, the screen where
-- they decide to buy, in the language the admin typed. Each entry may now carry its own words per language:
--   translations = { "pt": { "title", "description", "includes" }, "es": { ... } }
-- The main fields stay the English (default) text; a language with nothing typed falls back to them, field by field.
-- Everything that exists today has no translations ('{}'), so nothing changes until the admin types one.
-- Idempotent: safe to run more than once.
-- Recovery: alter table tag_showcase_items drop column translations.

ALTER TABLE "tag_showcase_items" ADD COLUMN IF NOT EXISTS "translations" jsonb NOT NULL DEFAULT '{}'::jsonb;
