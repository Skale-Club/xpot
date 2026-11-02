-- Automatic closure records a deadline, not an invented visit outcome or duration.
ALTER TABLE sales_visits ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS sales_visits_timeout_idx ON sales_visits (checked_in_at)
  WHERE status = 'in_progress';
