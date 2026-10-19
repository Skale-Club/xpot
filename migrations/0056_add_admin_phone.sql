-- A second admin sign-in, +18573109609: the owner can no longer receive the
-- SMS code on the existing admin's phone, and only an admin can approve
-- sign-ups (Admin → People). The existing admin is left as it is.
--
-- If the number already has an account (e.g. it signed up as a rep), that
-- account becomes the admin; otherwise a new one is created. Either way it is
-- active and unblocked, with any access request marked approved, so the first
-- sign-in lands straight in the app (server/auth/phoneAuth.ts accessOf).
--
-- Only on a database that already has an admin: a fresh dev/CI database gets
-- no account from this.
DO $$
DECLARE
  admin_phone CONSTANT text := '+18573109609';
  uid text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "is_admin") THEN
    RETURN;
  END IF;

  SELECT "id" INTO uid FROM "users" WHERE "phone" = admin_phone;
  IF uid IS NULL THEN
    INSERT INTO "users" ("phone", "first_name", "last_name", "is_admin")
    VALUES (admin_phone, 'Xpot', 'Admin', true)
    RETURNING "id" INTO uid;
  ELSE
    UPDATE "users" SET "is_admin" = true, "updated_at" = now() WHERE "id" = uid;
  END IF;

  INSERT INTO "sales_reps" ("user_id", "display_name", "phone", "role", "is_active")
  VALUES (uid, 'Xpot Admin', admin_phone, 'admin', true)
  ON CONFLICT ("user_id") DO UPDATE SET
    "role" = 'admin',
    "is_active" = true,
    "blocked_at" = NULL,
    "blocked_reason" = NULL,
    "refused_at" = NULL,
    "updated_at" = now();

  UPDATE "auth_access_requests"
  SET "status" = 'approved', "reviewed_at" = now()
  WHERE "user_id" = uid AND "status" <> 'approved';
END $$;
