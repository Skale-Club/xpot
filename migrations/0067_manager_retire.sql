-- The Manager role is gone (docs/PROFILES_EXECUTION_PLAN.md, D1). Access now comes from users.is_admin (the platform's
-- owners) and the Organization membership (owner or employee); nothing checks sales_reps.role = 'manager' any more.
-- Nobody holds it today. Should anyone, they become a plain rep, keeping their Organization memberships.
-- The enum value stays: Postgres can't drop one without rebuilding the type.
-- Idempotent: safe to run more than once.
UPDATE "sales_reps" SET "role" = 'rep', "updated_at" = now() WHERE "role" = 'manager';
