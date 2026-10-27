-- Tags › custody from the phone (docs/TAG_CUSTODY_EXECUTION_PLAN.md, phase 1): the phone can erase a piece's chip
-- (an empty NDEF message), recorded as a provisioning event like a write or a lock. Widens the event_type CHECK of
-- tag_provisioning_events (0009_tags.sql) with 'erase_completed'. Idempotent.

ALTER TABLE "tag_provisioning_events" DROP CONSTRAINT IF EXISTS "tag_provisioning_events_event_type_check";
ALTER TABLE "tag_provisioning_events" ADD CONSTRAINT "tag_provisioning_events_event_type_check" CHECK ("event_type" IN (
  'job_created', 'job_claimed', 'job_cancelled', 'job_expired',
  'reader_connected', 'reader_disconnected', 'tag_detected',
  'write_started', 'write_completed', 'verification_passed', 'verification_failed',
  'lock_requested', 'lock_completed', 'erase_completed', 'error'
));
