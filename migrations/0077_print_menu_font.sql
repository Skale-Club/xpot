-- Which Menu title font a print uses, chosen when a Menu piece is asked for: all six are approved and each is a different
-- print file. NULL keeps what the version's params say (every other face, and Menu prints made before the choice).
-- Idempotent: safe to run more than once.
-- Recovery: alter table print_jobs drop column menu_font; alter table print_requests drop column menu_font.

ALTER TABLE "print_requests" ADD COLUMN IF NOT EXISTS "menu_font" text;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "menu_font" text;
