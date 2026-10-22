-- Tags › Production, phase 3 (docs/PRINT_EXECUTION_PLAN.md §7.3): "Send to printer". An admin asks for a ready order to
-- be sent; the paired bench, which is on the printer's network, uploads its sliced file to the A1 over FTPS and starts
-- the print over MQTT (the printer's access code never leaves the bench). The bench also reports the printer's state.
--   * print_jobs.send_requested_at / _by: the admin's request (the human confirmation before hardware moves).
--   * print_jobs.send_claimed_at / send_device_id: the bench that took the request, so it is sent once.
--   * print_jobs.sent_at: the printer accepted the job (the order is then `printing`).
--   * tag_provisioning_devices.printer_status (+ _at): the last state a bench read from its printer.
-- Adds nullable columns only. Idempotent.

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "send_requested_at" timestamptz;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "send_requested_by_user_id" text;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "send_claimed_at" timestamptz;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "send_device_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz;

DO $$ BEGIN
  ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_send_device_fk"
    FOREIGN KEY ("send_device_id") REFERENCES "tag_provisioning_devices"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "print_jobs_send_queue_idx" ON "print_jobs" ("send_requested_at")
  WHERE "send_requested_at" IS NOT NULL AND "sent_at" IS NULL;

ALTER TABLE "tag_provisioning_devices" ADD COLUMN IF NOT EXISTS "printer_status" jsonb;
ALTER TABLE "tag_provisioning_devices" ADD COLUMN IF NOT EXISTS "printer_status_at" timestamptz;
