-- Reprinting the damaged pieces of a printed plate, once (docs/simplicity/producao.md, R2-FLX-1). The button "Print the
-- 2 damaged again" asked for a plain new request, so asking twice made two requests for the same two pieces. The new
-- request now remembers the printed plate it replaces:
--   print_requests.replaces_job_id = the printed print job whose damaged pieces this request makes again.
-- The server refuses a second replacement while one is alive (any plate of it not cancelled); a replacement that was
-- cancelled entirely leaves the plate free to be reprinted. Old requests have none (NULL): nothing changes for them.
-- Idempotent: safe to run more than once.
-- Recovery: alter table print_requests drop column replaces_job_id.

ALTER TABLE "print_requests" ADD COLUMN IF NOT EXISTS "replaces_job_id" uuid;

DO $$ BEGIN
  ALTER TABLE "print_requests" ADD CONSTRAINT "print_requests_replaces_job_fk"
    FOREIGN KEY ("replaces_job_id") REFERENCES "print_jobs"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "print_requests_replaces_idx" ON "print_requests" ("replaces_job_id") WHERE "replaces_job_id" IS NOT NULL;
