-- Enable Row Level Security on all sales_ tables.
--
-- These tables had RLS disabled while the public anon/authenticated roles held
-- full DML grants — meaning the publicly-shipped Supabase anon key could read and
-- write all sales data directly via PostgREST, bypassing the Express API's auth.
--
-- The app connects as the table owner (postgres, BYPASSRLS = true), so enabling
-- RLS does NOT affect application queries; it only blocks direct anon/authenticated
-- access (default-deny, no policies). This matches the security model the README
-- already documents ("all tables RLS-protected").
--
-- Scope: sales_ tables only. The shared users/sessions/integration_* tables belong
-- to skaleclub and are intentionally left untouched.

ALTER TABLE "sales_reps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_lead_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_lead_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_visit_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_opportunities_local" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_sync_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_app_settings" ENABLE ROW LEVEL SECURITY;
